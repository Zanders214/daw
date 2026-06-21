#pragma once

#include <JuceHeader.h>
#include "TrackChannel.h"
#include <array>
#include <atomic>

/**
 * AudioEngine — the real-time core. Owns the audio device, a Phase-1 audio
 * source (a file player or the hardware input), and the fixed 3-slot master FX
 * chain (eq -> tape -> pre). It runs the hosted plugins' processBlock in series
 * on the audio thread, meters the output, and advances a beat clock.
 *
 * Owns the plugin instances (lifetime) and their editor windows. Plugin
 * pointers are guarded by `chainLock`; the audio callback uses a try-lock so a
 * (rare) load never blocks audio for long.
 */
class AudioEngine : public juce::AudioIODeviceCallback
{
public:
    AudioEngine();
    ~AudioEngine() override;

    void initialise();
    void shutdown();

    juce::AudioDeviceManager& getDeviceManager() { return deviceManager; }
    double getSampleRate() const { return currentSampleRate; }
    int getBlockSize() const { return currentBlockSize; }

    // Audio device settings (real). `getDevicesInfo` returns the current setup
    // plus the available outputs / sample rates / buffer sizes; `applySettings`
    // applies { sampleRate(Hz), bufferSize, outputDevice } to the live device.
    juce::var getDevicesInfo();
    void applySettings (const juce::var& opts);

    // Transport
    void setPlaying (bool shouldPlay);
    void stop();
    void setPosition (double beats);
    void setLooping (bool b) { looping.store (b); }
    void setRecording (bool b) { recording.store (b); }
    void setTempo (double bpm) { tempo.store (juce::jmax (20.0, bpm)); }
    bool isPlaying() const { return playing.load(); }
    double getPlayheadBeats() const { return playheadBeats.load(); }
    float getMasterLevel() const { return masterLevel.load(); }
    double getTempo() const { return tempo.load(); }

    // Loop region (beats)
    void setLoopRegion (double startBeats, double endBeats);
    double getLoopStart() const { return loopStartBeats.load(); }
    double getLoopEnd() const { return loopEndBeats.load(); }

    // Source (legacy single-stream path; kept for back-compat)
    bool loadAudioFile (const juce::File& file);
    void setInputMode (const juce::String& mode); // "file" | "input"

    // Mixer (multitrack). Tracks are keyed by the UI's string ids and created
    // on demand. Scalar controls are lock-free; file (re)assignment takes
    // `tracksLock` (same pattern as the plugin chain).
    void setTrackGain (const juce::String& id, float gainLinear);
    void setTrackMute (const juce::String& id, bool muted);
    void setTrackSolo (const juce::String& id, bool soloed);
    void setTrackArm  (const juce::String& id, bool armed);
    bool assignTrackFile (const juce::String& id, const juce::File& file);
    void clearTrackFile  (const juce::String& id);

    void setMasterVolume (float v) { masterVolume.store (juce::jlimit (0.0f, 2.0f, v)); }
    float getMasterVolume() const { return masterVolume.load(); }

    /** Per-track meter levels { id: 0..1 } for the state event. */
    juce::var buildTrackLevels();
    /** Per-track source info { id: { loaded, name, path } } for the tracks event. */
    juce::var buildTrackInfo();

    // Plugin chain (slot 0..2). Takes ownership of the instance.
    void installPlugin (int slot, std::unique_ptr<juce::AudioPluginInstance> instance);
    void removePlugin (int slot);
    bool hasPlugin (int slot) const;
    juce::String getPluginName (int slot) const;
    void setBypassed (int slot, bool b);
    bool isBypassed (int slot) const { return (slot >= 0 && slot < 3) && bypassed[(size_t) slot].load(); }
    void setParam (int slot, const juce::String& paramId, float value01);
    juce::var listParams (int slot);
    void openEditor (int slot);
    void closeEditor (int slot);

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
    void prepareSlot (int slot);
    juce::AudioPluginInstance* getInstance (int slot) const;
    TrackChannel& ensureTrack (const juce::String& id);
    void recomputeAnySolo();
    double beatsToSeconds (double beats) const;

    static constexpr int numSlots = 3;
    static constexpr double totalBeats = 128.0;

    juce::AudioDeviceManager deviceManager;

    // Source
    juce::AudioFormatManager audioFormatManager;
    std::unique_ptr<juce::AudioFormatReaderSource> readerSource;
    juce::AudioTransportSource transportSource;
    juce::String inputMode { "file" };
    std::atomic<bool> fileLoaded { false };

    // Plugin chain
    juce::CriticalSection chainLock;
    std::array<std::unique_ptr<juce::AudioPluginInstance>, numSlots> chain;
    std::array<std::atomic<bool>, numSlots> bypassed { { {false}, {false}, {false} } };
    std::array<std::unique_ptr<juce::DocumentWindow>, numSlots> editorWindows;

    // Mixer (multitrack). The message thread owns the channels; the audio
    // thread iterates them under a try-lock (same contract as chainLock).
    // `readThread` is declared first so it outlives the tracks whose transports
    // deregister from it on destruction.
    juce::TimeSliceThread readThread { "track-read" };
    juce::CriticalSection tracksLock;
    juce::OwnedArray<TrackChannel> tracks;
    juce::HashMap<juce::String, TrackChannel*> trackById;
    std::atomic<int> anySolo { 0 };          // cached count of soloed tracks
    std::atomic<float> masterVolume { 1.0f };

    // Transport state
    std::atomic<bool> playing { false };
    std::atomic<bool> looping { true };
    std::atomic<bool> recording { false };
    std::atomic<double> tempo { 124.0 };
    std::atomic<double> playheadBeats { 0.0 };
    std::atomic<float> masterLevel { 0.0f };
    std::atomic<double> loopStartBeats { 0.0 };
    std::atomic<double> loopEndBeats { totalBeats };

    double currentSampleRate { 44100.0 };
    int currentBlockSize { 512 };
    juce::AudioBuffer<float> scratch;
    juce::MidiBuffer midi;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};
