#pragma once

#include <JuceHeader.h>
#include "DeviceRack.h"
#include "RtSafety.h"

/**
 * GroupBus — a sub-mix node (DRUMS / BASS / SYNTHS / VOX&FX). Member tracks
 * render into its buffer; the engine then applies the group's gain + pan, meters
 * it, and sums it into the master bus. Scalar controls are atomics (lock-free
 * from any thread); the buffer is touched only on the audio thread and sized per
 * block like the master scratch.
 */
class GroupBus
{
public:
    explicit GroupBus (juce::String groupId) : id (std::move (groupId)) {}

    const juce::String& getId() const noexcept { return id; }

    void prepare (double sampleRate, int blockSize)
    {
        buffer.setSize (2, blockSize, false, false, true);
        inserts.prepare (sampleRate, blockSize);
    }

    /** Resize + clear at the top of each callback (mirrors the master scratch). */
    void clearBuffer (int numSamples)
    {
        buffer.setSize (2, numSamples, false, false, true);
        buffer.clear();
    }

    juce::AudioBuffer<float>& getBuffer() noexcept { return buffer; }

    /** Run group inserts, then apply the group's gain + pan, meter, and add into
        the master bus. The insert chain (try-lock + hosted plugins) is kept out of
        the real-time-annotated region; the gain/pan/meter/sum tail is the leaf DSP. */
    void sumInto (juce::AudioBuffer<float>& master, int numSamples)
    {
        rackMidi.clear();
        inserts.process (buffer, rackMidi);   // try-lock + hosted plugins: not RT-annotated
        applyGainPanMeterAndSum (master, numSamples);
    }

    /** Leaf DSP tail of sumInto: apply gain + pan, meter, and sum into `master`.
        Pure float math + atomics: real-time-safe, annotated for RTSan. */
    void applyGainPanMeterAndSum (juce::AudioBuffer<float>& master, int numSamples) noexcept ZD_RT_NONBLOCKING
    {
        buffer.applyGain (gain.load());

        if (const float p = pan.load(); buffer.getNumChannels() >= 2 && ! juce::approximatelyEqual (p, 0.5f))
        {
            buffer.applyGain (0, 0, numSamples, p <= 0.5f ? 1.0f : (1.0f - p) * 2.0f);
            buffer.applyGain (1, 0, numSamples, p >= 0.5f ? 1.0f : p * 2.0f);
        }

        float peak = 0.0f;
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            peak = juce::jmax (peak, buffer.getMagnitude (ch, 0, numSamples));
        level.store (juce::jmax (peak, level.load() * 0.88f));

        const int mCh = master.getNumChannels();
        const int bCh = buffer.getNumChannels();
        for (int ch = 0; ch < mCh; ++ch)
            master.addFrom (ch, 0, buffer, juce::jmin (ch, bCh - 1), 0, numSamples);
    }

    // ---- real-time controls (atomics) ----
    std::atomic<float> gain  { 1.0f };
    std::atomic<float> pan   { 0.5f };
    std::atomic<bool>  mute  { false };
    std::atomic<bool>  solo  { false };
    std::atomic<float> level { 0.0f };

    /** Insert FX chain for this group bus (pre gain/pan). */
    DeviceRack inserts;

private:
    juce::String id;
    juce::AudioBuffer<float> buffer;
    juce::MidiBuffer rackMidi;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GroupBus)
};
