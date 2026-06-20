#pragma once

#include <JuceHeader.h>
#include "EngineController.h"

/** Root component: a full-bleed WebBrowserComponent driven by the engine. */
class MainComponent : public juce::Component
{
public:
    MainComponent();
    ~MainComponent() override;

    void resized() override;

private:
    EngineController controller;
    std::unique_ptr<juce::WebBrowserComponent> webView;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};
