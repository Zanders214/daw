#pragma once

#include <JuceHeader.h>
#include <atomic>
#include <memory>
#include <vector>
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
    juce::String displayName;
    juce::String type;
    juce::String color;
    void setMeta (const juce::String& n, const juce::String& t, const juce::String& c)
    {
        if (n.isNotEmpty()) displayName = n;
        if (t.isNotEmpty()) type = t;
        if (c.isNotEmpty()) color = c;
    }

    // ---- clip timeline ----
    /** One audio clip placed on the timeline (beats), built on the message thread. */
    struct ClipSpec
    {
        juce::String clipId;
        juce::String filePath;
        double startBeat  { 0.0 };
        double lenBeats   { 0.0 };
        double offsetSec  { 0.0 };  // in-buffer start offset
        float  gain       { 1.0f };
    };

    // ---- message thread: source + lifecycle ----
    /** Replace this track's clips. Each spec's file is opened through an
        AudioTransportSource (sample-rate corrected + read-ahead). Returns the
        number of clips that loaded successfully. */
    int setClips (juce::AudioFormatManager& formatManager,
                  juce::TimeSliceThread& readThread,
                  const std::vector<ClipSpec>& specs);
    /** Load a single file spanning the whole timeline (back-compat shim over
        setClips). Returns false if unreadable. */
    bool loadFile (juce::AudioFormatManager& formatManager,
                   juce::TimeSliceThread& readThread,
                   const juce::File& file);
    void clearFile();
    void prepare (double sampleRate, int blockSize);
    void releaseResources();

    bool hasFile() const noexcept { return ! clips.empty(); }
    juce::String getFilePath() const { return clips.empty() ? juce::String() : clips.front()->filePath; }
    juce::String getFileName() const { return juce::File (getFilePath()).getFileName(); }

    // ---- transport (called from the engine when the global transport moves) ----
    /** Drop all clips out of their "playing" state so the next render block
        re-enters them at the correct offset (call on seek / loop-wrap / play
        toggle so playback never drifts). */
    void resyncClips();

    // ---- audio thread ----
    /** Advance this track's active clips by `numSamples` (so muted/soloed-out
        tracks stay in sync), then — when `audible` — apply insert FX, gain, pan,
        ADD into `bus`, tap sends, and meter. `blockStartBeats`/`bpm`/`playing`
        drive which clips are under the playhead this block. */
    void renderInto (juce::AudioBuffer<float>& bus,
                     juce::AudioBuffer<float>* sendBuses, int numSendBuses,
                     int numSamples, bool audible,
                     double blockStartBeats, double bpm, bool playing);
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
    /** A clip + its own transport (AudioTransportSource isn't movable, so these
        live behind unique_ptr in a vector). */
    struct ClipPlayer
    {
        juce::String clipId;
        juce::String filePath;
        double startBeat  { 0.0 };
        double lenBeats   { 0.0 };
        double offsetSec  { 0.0 };
        float  gain       { 1.0f };
        std::unique_ptr<juce::AudioFormatReaderSource> reader;
        juce::AudioTransportSource transport;
        bool   active     { false };  // currently started (playhead inside region)
    };

    juce::String id;
    std::vector<std::unique_ptr<ClipPlayer>> clips;

    juce::AudioBuffer<float> trackScratch;  // summed clips for this block
    juce::AudioBuffer<float> clipScratch;   // one clip's pull
    juce::MidiBuffer rackMidi;              // empty MIDI for the insert chain
    double preparedSampleRate { 0.0 };
    int    preparedBlockSize  { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TrackChannel)
};
