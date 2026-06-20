#pragma once

#include <JuceHeader.h>
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

    // Source
    bool loadAudioFile (const juce::File& file);
    void setInputMode (const juce::String& mode); // "file" | "input"

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

    // Transport state
    std::atomic<bool> playing { false };
    std::atomic<bool> looping { true };
    std::atomic<bool> recording { false };
    std::atomic<double> tempo { 124.0 };
    std::atomic<double> playheadBeats { 0.0 };
    std::atomic<float> masterLevel { 0.0f };

    double currentSampleRate { 44100.0 };
    int currentBlockSize { 512 };
    juce::AudioBuffer<float> scratch;
    juce::MidiBuffer midi;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};
