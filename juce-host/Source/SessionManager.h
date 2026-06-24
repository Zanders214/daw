#pragma once

#include <JuceHeader.h>
#include <array>
#include <functional>
#include "PluginHost.h" // PluginHost::numSlots / slotKey (static helpers)

class AudioEngine;

/**
 * SessionManager — owns session save / load / import / export for the engine.
 * Split out of EngineController to keep that class focused on command dispatch.
 *
 * It builds the `engine` half of a session payload (full plugin state, track list,
 * node-rack states), restores it back into the AudioEngine, and runs the native
 * Export/Import file dialogs. Master-plugin state that arrives before its slot has
 * finished loading is parked here (per slot) and consumed later by the caller via
 * `consumePending`.
 */
class SessionManager
{
public:
    /** Push a bridge event to the web (EngineController::emit). */
    using EmitFn = std::function<void (const juce::Identifier&, const juce::var&)>;
    /** Instantiate a device into a node's insert rack (EngineController::nodeDeviceAdd). */
    using AddNodeDeviceFn = std::function<void (const juce::String& nodeId, const juce::String& id,
                                                const juce::String& kind, const juce::String& path,
                                                const juce::String& stateB64)>;

    SessionManager (AudioEngine& engineToUse, EmitFn emitToUse, AddNodeDeviceFn addNodeDeviceToUse);

    /** Build a full session var ({ version, name, savedAt, ui, engine }). */
    juce::var buildSession (const juce::String& name, const juce::var& uiPayload);
    /** Restore the `engine` payload (tracks → master plugins → node racks). */
    void applyEnginePayload (const juce::var& enginePayload);
    /** Native "Save As" to a .zdaw file. */
    void sessionExport (const juce::String& name, const juce::var& uiPayload);
    /** Native "Open" of a .zdaw file; restores it and emits engineSessionImported. */
    void sessionImport();

    /** Take (and clear) any plugin state deferred for a slot that wasn't loaded
        yet when the session was restored. Returns empty if none pending. */
    juce::String consumePending (int slot);

private:
    juce::var buildEnginePayload(); // full plugin state, keyed by slot, base64-encoded
    void restoreTracks (const juce::DynamicObject& obj);
    void restoreMasterPlugins (const juce::DynamicObject& obj);
    void restoreNodeRacks (const juce::DynamicObject& obj);

    AudioEngine& audioEngine;
    EmitFn emit;
    AddNodeDeviceFn addNodeDevice;

    // Plugin state awaiting its slot to finish loading (startup restore ordering).
    std::array<juce::String, PluginHost::numSlots> pendingPluginState;

    std::unique_ptr<juce::FileChooser> chooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SessionManager)
};
