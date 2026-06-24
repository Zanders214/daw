#include "SessionManager.h"
#include "AudioEngine.h"

using namespace juce;

SessionManager::SessionManager (AudioEngine& engineToUse, EmitFn emitToUse, AddNodeDeviceFn addNodeDeviceToUse)
    : audioEngine (engineToUse), emit (std::move (emitToUse)), addNodeDevice (std::move (addNodeDeviceToUse))
{
}

var SessionManager::buildEnginePayload()
{
    DynamicObject::Ptr plugins = new DynamicObject();
    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
        plugins->setProperty (PluginHost::slotKey (slot), audioEngine.masterBus().getPluginState (slot));

    DynamicObject::Ptr engineObj = new DynamicObject();
    engineObj->setProperty ("plugins", var (plugins.get()));
    engineObj->setProperty ("tracks", audioEngine.buildTrackList());
    engineObj->setProperty ("nodes", audioEngine.buildNodeRackStates());
    return var (engineObj.get());
}

var SessionManager::buildSession (const String& name, const var& uiPayload)
{
    DynamicObject::Ptr obj = new DynamicObject();
    obj->setProperty ("version", 3); // keep in lockstep with SESSION_VERSION (session.ts)
    obj->setProperty ("name", name);
    obj->setProperty ("savedAt", Time::getCurrentTime().toISO8601 (true));
    obj->setProperty ("ui", uiPayload);
    obj->setProperty ("engine", buildEnginePayload());
    return var (obj.get());
}

void SessionManager::applyEnginePayload (const var& enginePayload)
{
    const auto* obj = enginePayload.getDynamicObject();
    if (obj == nullptr)
        return;

    restoreTracks (*obj);
    restoreMasterPlugins (*obj);
    restoreNodeRacks (*obj);
}

// 1) Recreate tracks first so node racks/automation resolve to real channels.
//    (v1/v2 sessions have no track list — those tracks are created on demand by
//    the mixer commands the web replays via applySessionToEngine.)
void SessionManager::restoreTracks (const DynamicObject& obj)
{
    const auto* trackArr = obj.getProperty ("tracks").getArray();
    if (trackArr == nullptr)
        return;

    for (const auto& tv : *trackArr)
    {
        const auto* t = tv.getDynamicObject();
        if (t == nullptr)
            continue;

        const String id = t->getProperty ("id").toString();
        if (id.isEmpty())
            continue;

        audioEngine.createTrack (id, t->getProperty ("name").toString(),
                                 t->getProperty ("type").toString(),
                                 t->getProperty ("color").toString(),
                                 t->getProperty ("group").toString());
        const auto fp = t->getProperty ("filePath").toString();
        if (fp.isNotEmpty() && File (fp).existsAsFile())
            audioEngine.assignTrackFile (id, File (fp));
    }
}

// 2) Master chain plugins (fixed eq/tape/pre).
void SessionManager::restoreMasterPlugins (const DynamicObject& obj)
{
    const auto* plugins = obj.getProperty ("plugins").getDynamicObject();
    if (plugins == nullptr)
        return;

    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
    {
        const auto b64 = plugins->getProperty (PluginHost::slotKey (slot)).toString();
        if (b64.isEmpty())
            continue;
        // Apply now if the instance exists; otherwise defer until it loads.
        if (audioEngine.masterBus().hasPlugin (slot))
            audioEngine.masterBus().setPluginState (slot, b64);
        else
            pendingPluginState[(size_t) slot] = b64;
    }
}

// 3) Per-node insert racks: instantiate each saved device into its node in chain
//    order (a placeholder reserves order; the async load fills it) and restore
//    its state on completion. v3 stores an ordered array per node; v2 stored a
//    slot-keyed object ({ eq|tape|pre: state }) — handle both.
void SessionManager::restoreNodeRacks (const DynamicObject& obj)
{
    auto* nodes = obj.getProperty ("nodes").getDynamicObject();
    if (nodes == nullptr)
        return;

    auto restoreFromArray = [this] (const String& nodeId, const Array<var>& list)
    {
        for (const auto& dv : list)
            if (const auto* d = dv.getDynamicObject())
                addNodeDevice (nodeId, d->getProperty ("id").toString(),
                               d->getProperty ("kind").toString(),
                               d->getProperty ("path").toString(),
                               d->getProperty ("state").toString());
    };

    for (const auto& np : nodes->getProperties())
    {
        if (const auto* list = np.value.getArray())
            restoreFromArray (np.name.toString(), *list);
        else if (auto* slots = np.value.getDynamicObject()) // v2 fallback
            for (const auto& sp : slots->getProperties())
            {
                const auto key = sp.name.toString(); // "eq" | "tape" | "pre"
                addNodeDevice (np.name.toString(), key + "-" + Uuid().toString().substring (0, 8),
                               key, {}, sp.value.toString());
            }
    }
}

void SessionManager::sessionExport (const String& name, const var& uiPayload)
{
    auto session = buildSession (name.isNotEmpty() ? name : String ("Untitled"), uiPayload);
    chooser = std::make_unique<FileChooser> ("Export session", File(), "*.zdaw");
    chooser->launchAsync (FileBrowserComponent::saveMode | FileBrowserComponent::canSelectFiles
                              | FileBrowserComponent::warnAboutOverwriting,
        [session] (const FileChooser& fc)
        {
            auto result = fc.getResult();
            if (result == File())
                return;
            if (result.getFileExtension().isEmpty())
                result = result.withFileExtension ("zdaw");
            result.replaceWithText (JSON::toString (session));
        });
}

void SessionManager::sessionImport()
{
    chooser = std::make_unique<FileChooser> ("Import session", File(), "*.zdaw;*.json");
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this] (const FileChooser& fc)
        {
            const auto result = fc.getResult();
            if (! result.existsAsFile())
                return;

            const auto* obj = JSON::parse (result).getDynamicObject();
            if (obj == nullptr)
                return;

            applyEnginePayload (obj->getProperty ("engine"));

            // Hand the UI payload back to the web to hydrate the store. Send just
            // { name, ui } so the (potentially large) plugin blobs aren't re-sent.
            DynamicObject::Ptr payload = new DynamicObject();
            payload->setProperty ("name", obj->getProperty ("name"));
            payload->setProperty ("ui", obj->getProperty ("ui"));
            emit ("engineSessionImported", var (payload.get()));
        });
}

String SessionManager::consumePending (int slot)
{
    if (slot < 0 || slot >= (int) pendingPluginState.size())
        return {};
    auto s = pendingPluginState[(size_t) slot];
    pendingPluginState[(size_t) slot] = {};
    return s;
}
