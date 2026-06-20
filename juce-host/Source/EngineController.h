#pragma once

#include <JuceHeader.h>
#include "AudioEngine.h"
#include "PluginHost.h"

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
    void loadSlotFromPath (int slot, const juce::String& path);
    void pickPluginFile (int slot);
    void pickSourceFile();

    AudioEngine audioEngine;
    PluginHost pluginHost;
    juce::WebBrowserComponent* web = nullptr;

    double reel = 0.0;
    juce::uint32 lastTimeMs = 0;

    std::unique_ptr<juce::FileChooser> chooser;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineController)
};
