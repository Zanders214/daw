#pragma once

#include <JuceHeader.h>

class EngineController;

/**
 * Build the WebBrowserComponent that hosts the React UI: native integration
 * enabled, every bridge command registered as a native function delegating to
 * the EngineController, and (in release) a resource provider serving the
 * bundled Vite build. Sets the controller's web pointer and navigates to the
 * dev server (Debug) or the bundled root (Release).
 */
std::unique_ptr<juce::WebBrowserComponent> createWebView (EngineController& controller);
