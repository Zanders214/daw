#pragma once

#include <JuceHeader.h>
#include "RtSafety.h"
#include <array>
#include <atomic>

/**
 * MasterBus — the fixed 3-slot master FX chain plus the master volume / pan.
 * Split out of AudioEngine so the engine stays a thin real-time coordinator.
 *
 * Owns the plugin instances (lifetime) and their editor windows. Plugin pointers
 * are guarded by `chainLock`; the audio callback uses a try-lock so a (rare) load
 * never blocks audio for long.
 */
class MasterBus
{
public:
    static constexpr int numSlots = 3;

    MasterBus() = default;

    /** (Re)prepare every loaded plugin for the given stream format. */
    void prepare (double sampleRateToUse, int blockSizeToUse);
    /** Release every loaded plugin (device stopped / shutdown). */
    void releaseResources();

    /** Audio thread: run the chain in series over `buffer` (try-lock). */
    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);
    /** Audio thread: apply master volume then master pan (balance) to `buffer`.
        Leaf DSP (atomic loads + applyGain): real-time-safe, annotated for RTSan. */
    void applyMasterGainAndPan (juce::AudioBuffer<float>& buffer, int numSamples) const noexcept ZD_RT_NONBLOCKING;

    // Plugin chain (slot 0..2). Takes ownership of the instance.
    void installPlugin (int slot, std::unique_ptr<juce::AudioPluginInstance> instance);
    void removePlugin (int slot);
    bool hasPlugin (int slot) const;
    juce::String getPluginName (int slot) const;
    void setBypassed (int slot, bool b);
    bool isBypassed (int slot) const { return (slot >= 0 && slot < numSlots) && bypassed[(size_t) slot].load(); }
    void setParam (int slot, const juce::String& paramId, float value01) const;
    juce::var listParams (int slot) const;
    juce::String getPluginState (int slot) const;
    bool setPluginState (int slot, const juce::String& base64) const;

    void openEditor (int slot);
    void closeEditor (int slot);
    void closeAllEditors();

    // Master volume / pan.
    void setMasterVolume (float v) { masterVolume.store (juce::jlimit (0.0f, 2.0f, v)); }
    float getMasterVolume() const { return masterVolume.load(); }
    void setMasterPan (float v) { masterPan.store (juce::jlimit (0.0f, 1.0f, v)); }
    float getMasterPan() const { return masterPan.load(); }
    /** Automation targets (the atomics the manual setters write). */
    std::atomic<float>* volumeParam() { return &masterVolume; }
    std::atomic<float>* panParam()    { return &masterPan; }

private:
    juce::AudioPluginInstance* getInstance (int slot) const;
    void prepareSlot (int slot) const;

    juce::CriticalSection chainLock;
    std::array<std::unique_ptr<juce::AudioPluginInstance>, numSlots> chain;
    std::array<std::atomic<bool>, numSlots> bypassed { { {false}, {false}, {false} } };
    std::array<std::unique_ptr<juce::DocumentWindow>, numSlots> editorWindows;
    std::atomic<float> masterVolume { 1.0f };
    std::atomic<float> masterPan { 0.5f };

    double sampleRate { 44100.0 };
    int blockSize { 512 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MasterBus)
};
