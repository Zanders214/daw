#pragma once

#include <JuceHeader.h>
#include <atomic>
#include "DeviceRack.h"

class GroupBus;

/**
 * TrackChannel — one channel of the multitrack mixer. Owns an optional audio
 * source (a file played through an AudioTransportSource, which gives free
 * sample-rate correction and read-ahead buffering) plus the real-time mix
 * controls and a per-track meter.
 *
 * Lifetime/threading mirrors the plugin chain: the source graph is created and
 * destroyed on the message thread under the engine's `tracksLock`, while the
 * audio thread only touches it under a try-lock. The scalar controls
 * (gain/mute/solo/arm/level) are atomics and safe to set from any thread.
 */
class TrackChannel
{
public:
    explicit TrackChannel (juce::String trackId);
    ~TrackChannel();

    const juce::String& getId() const noexcept { return id; }

    // ---- metadata (message thread only; for the arrange/mixer + session) ----
    juce::String displayName, type, color;
    void setMeta (const juce::String& n, const juce::String& t, const juce::String& c)
    {
        if (n.isNotEmpty()) displayName = n;
        if (t.isNotEmpty()) type = t;
        if (c.isNotEmpty()) color = c;
    }

    // ---- message thread: source + lifecycle ----
    /** Load an audio file as this track's source. Returns false if unreadable. */
    bool loadFile (juce::AudioFormatManager& formatManager,
                   juce::TimeSliceThread& readThread,
                   const juce::File& file);
    void clearFile();
    void prepare (double sampleRate, int blockSize);
    void releaseResources();

    bool hasFile() const noexcept { return fileLoaded.load(); }
    juce::String getFilePath() const { return filePath; }
    juce::String getFileName() const { return juce::File (filePath).getFileName(); }

    // ---- transport (called from the engine when the global transport moves) ----
    void start();
    void stop();
    void setPositionSeconds (double seconds);

    // ---- audio thread ----
    /** Advance this track's source by `numSamples`; when `audible`, apply gain
        and ADD into `bus` and meter it (otherwise the meter decays). The pull
        happens regardless of audibility so a muted/soloed-out track stays in
        sync with the transport. */
    void renderInto (juce::AudioBuffer<float>& bus,
                     juce::AudioBuffer<float>* sendBuses, int numSendBuses,
                     int numSamples, bool audible);
    /** Decay the meter when the track is silent (muted / soloed-out / no file). */
    void decayMeter() noexcept { level.store (level.load() * 0.88f); }

    // ---- real-time controls (atomics; lock-free from any thread) ----
    std::atomic<float> gain  { 0.8f };   // matches DEFAULT_VOLUME on the JS side
    std::atomic<float> pan   { 0.5f };   // 0 = hard L, 0.5 = center, 1 = hard R
    std::atomic<bool>  mute  { false };
    std::atomic<bool>  solo  { false };
    std::atomic<bool>  arm   { false };
    std::atomic<float> level { 0.0f };   // decaying peak meter (0..1)

    /** Sub-mix routing: which group bus this track sums into (null = master). */
    std::atomic<GroupBus*> group { nullptr };

    /** Post-fader aux send amounts (0..1), one per send bus. */
    std::array<std::atomic<float>, 2> sends { { {0.0f}, {0.0f} } };

    /** Pre-fader insert FX chain for this track. */
    DeviceRack inserts;

private:
    juce::String id;
    juce::String filePath;
    std::atomic<bool> fileLoaded { false };

    std::unique_ptr<juce::AudioFormatReaderSource> readerSource;
    juce::AudioTransportSource transport;
    juce::AudioBuffer<float> trackScratch;
    juce::MidiBuffer rackMidi;            // empty MIDI for the insert chain
    double preparedSampleRate { 0.0 };
    int    preparedBlockSize  { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TrackChannel)
};
