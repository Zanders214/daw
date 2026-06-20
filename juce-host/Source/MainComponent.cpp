#include "MainComponent.h"
#include "WebUI.h"

using namespace juce;

MainComponent::MainComponent()
{
    webView = createWebView (controller); // sets controller's web pointer + navigates
    addAndMakeVisible (*webView);

    controller.start();                   // init audio, restore/scan plugins, stream state

    setSize (1920, 1080);
}

MainComponent::~MainComponent()
{
    // Detach the web view before the controller (and its engine) are destroyed.
    webView.reset();
}

void MainComponent::resized()
{
    if (webView != nullptr)
        webView->setBounds (getLocalBounds());
}
