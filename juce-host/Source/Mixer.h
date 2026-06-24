#pragma once

#include <JuceHeader.h>
#include "TrackChannel.h"
#include "GroupBus.h"
#include "DeviceRack.h"
#include "AutomationStore.h"
#include "MasterBus.h"
#include <array>
#include <atomic>
#include <vector>

/**
 * Mixer — the multitrack mixer: tracks, group sub-mix buses, aux sends/returns,
 * per-node insert racks and parameter automation. Split out of AudioEngine so
 * the engine stays a thin device + transport coordinator.
 *
 * The message thread owns the channels; the audio thread iterates them under a
 * try-lock (`tracksLock`). `readThread` is declared first so it outlives the
 * tracks whose transports deregister from it on destruction. Holds a reference
 * to the MasterBus only so automation can resolve the "master" vol/pan targets.
 */
class Mixer
{
public:
    static constexpr int numSends = 2;

    explicit Mixer (MasterBus& masterBusToUse) : masterBus (masterBusToUse)
    {
        audioFormatManager.registerBasicFormats();
    }

    void initialise();                                 // start the read thread
    void shutdown();                                   // clear tracks + stop the read thread
    void prepare (double sampleRateToUse, int blockSizeToUse); // prepare tracks/groups/returns
    void releaseResources();                           // device stopped

    // Audio thread.
    /** Sum the mixer (tracks -> groups -> returns) into `master`. */
    void mixInto (juce::AudioBuffer<float>& master, int numSamples,
                  double blockBeats, double bpm, bool playing);
    /** Evaluate every automation envelope at the (block-start) playhead. */
    void applyAutomation (double playheadBeats) { automation.apply (playheadBeats); }
    /** Drop clips out of their playing state (audio thread, on loop wrap). */
    void resyncClipsAudioThread();

    /** Drop clips out of their playing state (message thread, on transport change). */
    void resyncAllClips();

    // Track controls.
    void setTrackGain (const juce::String& id, float gainLinear);
    void setTrackPan  (const juce::String& id, float pan);
    void setTrackMute (const juce::String& id, bool muted);
    void setTrackSolo (const juce::String& id, bool soloed);
    void setTrackArm  (const juce::String& id, bool armed);
    bool assignTrackFile (const juce::String& id, const juce::File& file);
    void setTrackClips (const juce::String& id, const std::vector<TrackChannel::ClipSpec>& clips);
    void setTrackMidiNotes (const juce::String& id, std::vector<TrackChannel::MidiNoteSpec> notes);
    void clearTrackFile  (const juce::String& id) const;

    void createTrack (const juce::String& id, const juce::String& name,
                      const juce::String& type, const juce::String& color,
                      const juce::String& group);
    void destroyTrack (const juce::String& id);
    juce::var buildTrackList() const;

    // Group sub-mix buses.
    void setTrackGroup (const juce::String& trackId, const juce::String& groupId);
    void setGroupGain  (const juce::String& groupId, float gainLinear);
    void setGroupPan   (const juce::String& groupId, float pan);
    void setGroupMute  (const juce::String& groupId, bool muted);
    void setGroupSolo  (const juce::String& groupId, bool soloed);
    juce::var buildGroupLevels() const;

    // Aux sends / returns.
    void setTrackSend (const juce::String& trackId, int sendIdx, float amount);
    void setReturnGain (int sendIdx, float gainLinear);
    juce::var buildReturnLevels();

    // Per-node insert FX racks (track / group / "return-N").
    DeviceRack* rackForNode (const juce::String& nodeId);
    DeviceRack* ensureNodeRack (const juce::String& nodeId);
    juce::var buildNodeRacks();
    juce::var buildNodeRackStates();

    // Parameter automation.
    void setAutomation (const juce::String& nodeId, const juce::String& paramId,
                        std::vector<AutomationStore::Point> points);
    void clearAutomation (const juce::String& nodeId, const juce::String& paramId);
    void clearAllAutomation();

    juce::var buildTrackLevels() const;
    juce::var buildTrackInfo() const;

private:
    TrackChannel& ensureTrack (const juce::String& id);
    GroupBus& ensureGroup (const juce::String& id);
    void recomputeAnySolo();
    void recomputeAnyGroupSolo();
    AutomationStore::Target resolveAutoTarget (const juce::String& nodeId, const juce::String& paramId);

    MasterBus& masterBus; // only for automation "master" vol/pan targets

    juce::AudioFormatManager audioFormatManager;
    juce::TimeSliceThread readThread { "track-read" };
    juce::CriticalSection tracksLock;
    juce::OwnedArray<TrackChannel> tracks;
    juce::HashMap<juce::String, TrackChannel*> trackById;
    juce::OwnedArray<GroupBus> groups;
    juce::HashMap<juce::String, GroupBus*> groupById;
    std::atomic<int> anySolo { 0 };
    std::atomic<int> anyGroupSolo { 0 };
    std::array<juce::AudioBuffer<float>, numSends> sendBuses;
    std::array<DeviceRack, numSends> returnRacks;
    std::array<std::atomic<float>, numSends> returnGain  { { {1.0f}, {1.0f} } };
    std::array<std::atomic<float>, numSends> returnLevel { { {0.0f}, {0.0f} } };
    AutomationStore automation;
    juce::MidiBuffer returnMidi; // scratch for the return racks (audio thread)

    double sampleRate { 44100.0 };
    int blockSize { 512 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Mixer)
};
