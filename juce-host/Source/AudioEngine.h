#pragma once

#include <JuceHeader.h>
#include "MasterBus.h"
#include "Mixer.h"
#include <atomic>

/**
 * AudioEngine — the real-time core. Owns the audio device and a Phase-1 legacy
 * source (a file player or the hardware input), drives the per-block audio
 * callback, meters the output and advances the beat clock.
 *
 * The fixed 3-slot master FX chain + master volume/pan live in MasterBus; the
 * multitrack mixer (tracks, groups, sends, returns, node racks, automation)
 * lives in Mixer. This class wires those to the audio device and the transport.
 */
class AudioEngine : public juce::AudioIODeviceCallback
{
public:
    AudioEngine();
    ~AudioEngine() override;

    void initialise();
    void shutdown();

    /** Prepare the render pipeline for offline / headless use at a fixed stream
        format, without opening an audio device. This is what `audioDeviceAboutToStart`
        does, but driven by explicit params so a console driver (the rt_check /
        perf_bench harness, and a future offline bounce) can prepare and then call
        `audioDeviceIOCallbackWithContext` directly with its own buffers. */
    void prepareOffline (double sampleRate, int blockSize);

    juce::AudioDeviceManager& getDeviceManager() { return deviceManager; }
    double getSampleRate() const { return currentSampleRate; }
    int getBlockSize() const { return currentBlockSize; }

    // Audio device settings (real). `getDevicesInfo` returns the current setup
    // plus the available outputs / sample rates / buffer sizes; `applySettings`
    // applies { sampleRate(Hz), bufferSize, outputDevice } to the live device.
    juce::var getDevicesInfo() const;
    void applySettings (const juce::var& opts);

    // Transport
    void setPlaying (bool shouldPlay);
    void stop();
    void setPosition (double beats);
    void setLooping (bool b) { transport.looping.store (b); }
    void setRecording (bool b) { transport.recording.store (b); }
    void setTempo (double bpm) { transport.tempo.store (juce::jmax (20.0, bpm)); }
    bool isPlaying() const { return transport.playing.load(); }
    double getPlayheadBeats() const { return transport.playheadBeats.load(); }
    float getMasterLevel() const { return transport.masterLevel.load(); }
    double getTempo() const { return transport.tempo.load(); }

    // Loop region (beats)
    void setLoopRegion (double startBeats, double endBeats);
    double getLoopStart() const { return transport.loopStartBeats.load(); }
    double getLoopEnd() const { return transport.loopEndBeats.load(); }

    // Source (legacy single-stream path; kept for back-compat)
    bool loadAudioFile (const juce::File& file);
    void setInputMode (const juce::String& mode); // "file" | "input"

    /** The multitrack mixer (tracks / groups / sends / returns / racks / automation). */
    Mixer& mixer() { return mix; }
    /** The master FX chain + master volume / pan (slots, plugins, editors). */
    MasterBus& masterBus() { return master; }

    // AudioIODeviceCallback
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                           int numInputChannels,
                                           float* const* outputChannelData,
                                           int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

private:
    double beatsToSeconds (double beats) const;

    // Audio-callback helpers (run on the audio thread).
    /** Step 1: pull the legacy single source (file player or input monitor). */
    void renderLegacySource (const float* const* inputChannelData, int numInputChannels, int numSamples);
    /** Step 7: advance the beat clock and handle loop/totalBeats wrapping. */
    void advanceTransport (int numSamples);

    static constexpr double totalBeats = 128.0;

    juce::AudioDeviceManager deviceManager;

    // Source (legacy single-stream path). Members stay in construction order.
    struct Source
    {
        juce::AudioFormatManager audioFormatManager;
        std::unique_ptr<juce::AudioFormatReaderSource> readerSource;
        juce::AudioTransportSource transportSource;
        juce::String inputMode { "file" };
        std::atomic<bool> fileLoaded { false };
    } source;

    // Master FX chain + master volume / pan.
    MasterBus master;
    // Multitrack mixer (holds master& only for automation's "master" targets).
    Mixer mix { master };

    // Transport state. Members stay in construction order.
    struct Transport
    {
        std::atomic<bool> playing { false };
        std::atomic<bool> looping { true };
        std::atomic<bool> recording { false };
        std::atomic<double> tempo { 124.0 };
        std::atomic<double> playheadBeats { 0.0 };
        std::atomic<float> masterLevel { 0.0f };
        std::atomic<double> loopStartBeats { 0.0 };
        std::atomic<double> loopEndBeats { totalBeats };
    } transport;

    double currentSampleRate { 44100.0 };
    int currentBlockSize { 512 };
    juce::AudioBuffer<float> scratch;
    juce::MidiBuffer midi;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};
