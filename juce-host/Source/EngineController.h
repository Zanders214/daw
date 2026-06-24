#pragma once

#include <JuceHeader.h>
#include <array>
#include <optional>
#include "AudioEngine.h"
#include "PluginHost.h"
#include "SessionStore.h"
#include "SessionManager.h"

/**
 * EngineController — orchestrates AudioEngine + PluginHost and bridges them to
 * the web UI. It dispatches JS→C++ commands (`handle`) and, on a timer, pushes
 * `engineState` events (playhead / meters / reel) back to the page.
 */
class EngineController : private juce::Timer
{
public:
    EngineController();
    ~EngineController() override;

    void setWebView (juce::WebBrowserComponent* w) { web = w; }

    /** Initialise audio, restore configured plugins, auto-scan, start streaming state. */
    void start();

    /** Dispatch a named bridge command; returns a result var (may be void). */
    juce::var handle (const juce::String& name, const juce::Array<juce::var>& args);

private:
    void timerCallback() override;
    juce::var buildState();
    void emit (const juce::Identifier& id, const juce::var& payload);
    void emitPluginStatuses();
    void emitTrackInfo();
    void emitNodeRacks();

    // `handle` command dispatch, split by area to keep each function simple.
    // Each returns the command's result (a possibly-void var) when it owns
    // `name`, or nullopt to let the next group try.
    std::optional<juce::var> handleTransport   (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleMixer       (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleGroupSends  (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleAutomation  (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleNodeDevice  (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleTrackSource (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleDeviceChain (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleAudioSource (const juce::String& name, const juce::Array<juce::var>& args);
    std::optional<juce::var> handleSession     (const juce::String& name, const juce::Array<juce::var>& args);
    /** { id, name } for each parameter of a node-rack device (automation picker). */
    juce::var nodeDeviceListParams (const juce::String& nodeId, const juce::String& instanceId);
    /** Instantiate a device (built-in key or external "vst3" + path) into a node's
        insert rack at instance id `id` (async; a placeholder reserves chain order). */
    void nodeDeviceAdd (const juce::String& nodeId, const juce::String& id,
                        const juce::String& kind, const juce::String& path,
                        const juce::String& stateB64 = {});
    void loadSlotFromPath (int slot, const juce::String& path);
    void pickPluginFile (int slot);
    void pickNodeDeviceFile (const juce::String& nodeId, const juce::String& instanceId);
    void pickSourceFile();
    void pickTrackFile (const juce::String& trackId);
    /** Async chooser → emits `engineClipImported` { trackId, bar, path, name,
        durationSec } so the web can place an audio clip carrying a disk path. */
    void pickClipFile (const juce::String& trackId, double bar);

    AudioEngine audioEngine;
    PluginHost pluginHost;
    SessionStore sessionStore;
    // Session save/load/import/export (built on audioEngine + emit/nodeDeviceAdd).
    SessionManager sessions;
    juce::WebBrowserComponent* web = nullptr;

    double reel = 0.0;
    juce::uint32 lastTimeMs = 0;

    std::unique_ptr<juce::FileChooser> chooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineController)
};
