#include <JuceHeader.h>
#include "MainComponent.h"

using namespace juce;

/** Top-level window hosting the DAW UI. */
class MainWindow : public DocumentWindow
{
public:
    explicit MainWindow (const String& name)
        : DocumentWindow (name,
                          Colour (0xff06070b),
                          DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (new MainComponent(), true);
        setResizable (true, false);

        // The UI is authored at 1920×1080; open a bit smaller and let it scale.
        centreWithSize (1440, 810);
        Component::setVisible (true);
    }

    void closeButtonPressed() override
    {
        JUCEApplication::getInstance()->systemRequestedQuit();
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainWindow)
};

class ZandersDawApplication : public JUCEApplication
{
public:
    String getApplicationName() override    { return "Zanders DAW"; }
    String getApplicationVersion() override { return "0.1.0"; }
    bool moreThanOneInstanceAllowed() override     { return false; }

    void initialise (const String&) override
    {
        mainWindow = std::make_unique<MainWindow> (getApplicationName());
    }

    void shutdown() override
    {
        mainWindow = nullptr;
    }

    void systemRequestedQuit() override { quit(); }

private:
    std::unique_ptr<MainWindow> mainWindow;
};

START_JUCE_APPLICATION (ZandersDawApplication)
