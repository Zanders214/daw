#pragma once

#include <JuceHeader.h>

/** A window that hosts a plugin's editor and notifies on close. Shared by the
 *  master chain (AudioEngine) and per-node insert racks (DeviceRack). */
class PluginEditorWindow : public juce::DocumentWindow
{
public:
    explicit PluginEditorWindow (const juce::String& name)
        : juce::DocumentWindow (name, juce::Colours::black, juce::DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
    }

    std::function<void()> onCloseCallback;
    void closeButtonPressed() override { if (onCloseCallback) onCloseCallback(); }

    /** Open a window for the plugin (native editor if available, else generic). */
    static std::unique_ptr<PluginEditorWindow> openFor (juce::AudioPluginInstance& inst,
                                                        std::function<void()> onClose)
    {
        auto window = std::make_unique<PluginEditorWindow> (inst.getName());
        if (inst.hasEditor())
        {
            if (auto* editor = inst.createEditorIfNeeded())
                window->setContentNonOwned (editor, true);
            else
                window->setContentOwned (new juce::GenericAudioProcessorEditor (inst), true);
        }
        else
        {
            window->setContentOwned (new juce::GenericAudioProcessorEditor (inst), true);
        }

        window->onCloseCallback = std::move (onClose);
        window->setResizable (true, false);
        window->centreWithSize (window->getWidth(), window->getHeight());
        window->setVisible (true);
        return window;
    }
};
