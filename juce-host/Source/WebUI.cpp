#include "WebUI.h"
#include "EngineController.h"
#include <cstring>

#if ZD_HAS_WEB
 #include "BinaryData.h"
#endif

using namespace juce;

namespace
{
    /** All bridge command names (must match src/lib/engine.ts). */
    StringArray commandNames()
    {
        return {
            "transportSetPlaying", "transportStop", "transportSetPosition",
            "transportSetLooping", "transportSetRecording", "transportSetTempo",
            "transportSetLoopStart", "transportSetLoopEnd",
            "mixerSetTrackVolume", "mixerSetTrackPan", "mixerSetTrackMute", "mixerSetTrackSolo", "mixerSetTrackArm",
            "mixerSetTrackGroup", "mixerSetMasterVolume", "mixerSetMasterPan",
            "groupSetGain", "groupSetPan", "groupSetMute", "groupSetSolo",
            "mixerSetTrackSend", "returnSetGain",
            "automationSet", "automationClear", "automationClearAll",
            "nodeDeviceAdd", "nodeDeviceRemove", "nodeDeviceSetBypass",
            "nodeDeviceOpenEditor", "nodeDeviceCloseEditor", "nodeDeviceListParams",
            "nodeDevicePickFile",
            "trackCreate", "trackDelete",
            "trackAssignFile", "trackPickFile", "trackClearFile",
            "deviceSetBypass", "deviceSetParam", "deviceOpenEditor", "deviceCloseEditor", "deviceListParams",
            "pluginsScan", "pluginsAssign", "pluginsPickFile", "pluginsList",
            "audioGetDevices", "audioSetSettings",
            "sourcePickFile", "sourceSetInputMode",
            "sessionSave", "sessionLoad", "sessionList", "sessionDelete",
            "sessionExport", "sessionImport", "prefsSave", "prefsLoad"
        };
    }

    String mimeForPath (const String& path)
    {
        if (path.endsWithIgnoreCase (".html")) return "text/html";
        if (path.endsWithIgnoreCase (".js") || path.endsWithIgnoreCase (".mjs")) return "text/javascript";
        if (path.endsWithIgnoreCase (".css")) return "text/css";
        if (path.endsWithIgnoreCase (".json")) return "application/json";
        if (path.endsWithIgnoreCase (".svg")) return "image/svg+xml";
        if (path.endsWithIgnoreCase (".woff2")) return "font/woff2";
        if (path.endsWithIgnoreCase (".woff")) return "font/woff";
        if (path.endsWithIgnoreCase (".png")) return "image/png";
        if (path.endsWithIgnoreCase (".jpg") || path.endsWithIgnoreCase (".jpeg")) return "image/jpeg";
        if (path.endsWithIgnoreCase (".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

#if ZD_HAS_WEB
    /**
     * Serve the bundled Vite build out of BinaryData. Vite emits unique, hashed
     * asset filenames, so we match a request URL to a resource by basename
     * (BinaryData flattens nested paths, but the basenames stay unique).
     */
    std::optional<WebBrowserComponent::Resource> provideResource (const String& url)
    {
        const String path = (url == "/" || url.isEmpty()) ? String ("index.html")
                                                          : url.fromFirstOccurrenceOf ("/", false, false);
        const String base = path.fromLastOccurrenceOf ("/", false, false);

        for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
        {
            if (base.equalsIgnoreCase (BinaryData::originalFilenames[i]))
            {
                int size = 0;
                if (auto* data = BinaryData::getNamedResource (BinaryData::namedResourceList[i], size))
                {
                    std::vector<std::byte> bytes ((size_t) size);
                    std::memcpy (bytes.data(), data, (size_t) size);
                    return WebBrowserComponent::Resource { std::move (bytes), mimeForPath (base) };
                }
            }
        }
        return std::nullopt;
    }
#endif
}

std::unique_ptr<WebBrowserComponent> createWebView (EngineController& controller)
{
    auto options = WebBrowserComponent::Options{}
                       .withNativeIntegrationEnabled()
                       .withKeepPageLoadedWhenBrowserIsHidden();

#if JUCE_WINDOWS && JUCE_USE_WIN_WEBVIEW2
    // On Windows the resource provider + native integration (window.__JUCE__) only work
    // with the WebView2 backend; the default falls back to the legacy IE/Win32 WebView,
    // which can't serve them and shows "navigation to the webpage was cancelled". Force
    // WebView2 and give it a writable user-data folder (its default sits next to the .exe,
    // which aborts startup under a read-only install location).
    options = options
                  .withBackend (WebBrowserComponent::Options::Backend::webview2)
                  .withWinWebView2Options (
                      WebBrowserComponent::Options::WinWebView2Options{}
                          .withUserDataFolder (File::getSpecialLocation (File::userApplicationDataDirectory)
                                                   .getChildFile ("ZandersDAW")
                                                   .getChildFile ("WebView2"))
                          .withBackgroundColour (Colour (0xff06070b)));
#endif

#if ZD_HAS_WEB
    // Serve the bundled UI, and declare the origin the page is served from.
    // Without this second argument JUCE omits the Access-Control-Allow-Origin
    // response header, and WebKit then blocks Vite's
    // `<script type="module" crossorigin>` bundle — ES module scripts are always
    // fetched in CORS mode, so the document loads but its script never executes,
    // leaving the window stuck on the page background (a black screen).
    options = options.withResourceProvider (
        provideResource,
        URL (WebBrowserComponent::getResourceProviderRoot()).getOrigin());
#endif

    for (const auto& name : commandNames())
        options = options.withNativeFunction (
            Identifier (name),
            [&controller, name] (const Array<var>& args,
                                 const WebBrowserComponent::NativeFunctionCompletion& completion)
            {
                completion (controller.handle (name, args));
            });

    auto web = std::make_unique<WebBrowserComponent> (options);
    controller.setWebView (web.get());

#if JUCE_DEBUG
    web->goToURL ("http://localhost:1420");           // Vite dev server (hot reload)
#else
 #if ZD_HAS_WEB
    web->goToURL (WebBrowserComponent::getResourceProviderRoot()); // bundled UI
 #else
    web->goToURL ("http://localhost:1420");
 #endif
#endif

    return web;
}
