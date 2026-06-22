#include "EngineController.h"

using namespace juce;

EngineController::EngineController() = default;
EngineController::~EngineController() { stopTimer(); }

void EngineController::start()
{
    audioEngine.initialise();

    // Restore configured plugins; auto-scan default locations for any unset slot.
    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
    {
        const auto path = pluginHost.getSlotPath (slot);
        if (path.isNotEmpty() && File (path).exists())
            loadSlotFromPath (slot, path);
    }

    pluginHost.scanDefaultLocations ([this] (int slot, File f)
    {
        if (! audioEngine.hasPlugin (slot) && pluginHost.getSlotPath (slot).isEmpty())
            loadSlotFromPath (slot, f.getFullPathName());
    });

    lastTimeMs = Time::getMillisecondCounter();
    startTimerHz (30);
}

void EngineController::timerCallback()
{
    const auto now = Time::getMillisecondCounter();
    const double dt = (now - lastTimeMs) / 1000.0;
    lastTimeMs = now;

    if (audioEngine.isPlaying())
        reel = std::fmod (reel + dt * 300.0, 360.0);

    emit ("engineState", buildState());
}

var EngineController::buildState()
{
    auto* obj = new DynamicObject();
    obj->setProperty ("playhead", audioEngine.getPlayheadBeats());
    obj->setProperty ("playing", audioEngine.isPlaying());
    obj->setProperty ("master", (double) audioEngine.getMasterLevel());
    obj->setProperty ("reel", reel);
    obj->setProperty ("levels", audioEngine.buildTrackLevels());
    obj->setProperty ("groupLevels", audioEngine.buildGroupLevels());
    obj->setProperty ("returnLevels", audioEngine.buildReturnLevels());
    obj->setProperty ("loopStart", audioEngine.getLoopStart());
    obj->setProperty ("loopEnd", audioEngine.getLoopEnd());
    obj->setProperty ("tempo", audioEngine.getTempo());
    obj->setProperty ("masterVolume", (double) audioEngine.getMasterVolume());
    return var (obj);
}

void EngineController::emit (const Identifier& id, const var& payload)
{
    if (web != nullptr)
        web->emitEventIfBrowserIsVisible (id, payload);
}

void EngineController::emitPluginStatuses()
{
    auto* obj = new DynamicObject();
    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
    {
        auto* s = new DynamicObject();
        s->setProperty ("loaded", audioEngine.hasPlugin (slot));
        s->setProperty ("name", audioEngine.getPluginName (slot));
        s->setProperty ("path", pluginHost.getSlotPath (slot));
        obj->setProperty (PluginHost::slotKey (slot), var (s));
    }
    emit ("enginePlugins", var (obj));
}

void EngineController::emitTrackInfo()
{
    emit ("engineTracks", audioEngine.buildTrackInfo());
}

void EngineController::emitNodeRacks()
{
    emit ("engineNodeRacks", audioEngine.buildNodeRacks());
}

void EngineController::nodeDeviceAdd (const String& nodeId, const String& id, const String& kind,
                                     const String& path, const String& stateB64)
{
    auto* rack = audioEngine.ensureNodeRack (nodeId);
    if (rack == nullptr || id.isEmpty())
        return;

    // Resolve the file: built-in keys map to their configured .vst3; otherwise use
    // the supplied external path. Reserve the chain slot synchronously (preserving
    // order across out-of-order async loads), then fill or mark-missing on completion.
    String resolved = path;
    if (PluginHost::slotIndex (kind) >= 0 && resolved.isEmpty())
        resolved = pluginHost.resolveBuiltInPath (kind);

    rack->addPlaceholder (id, kind, resolved, kind);
    emitNodeRacks();

    if (resolved.isEmpty() || ! File (resolved).exists())
    {
        rack->markMissing (id); // a non-house FX or a moved external plugin
        emitNodeRacks();
        return;
    }

    pluginHost.createFromPath (
        File (resolved), audioEngine.getSampleRate(), audioEngine.getBlockSize(),
        [this, nodeId, id, stateB64] (std::unique_ptr<AudioPluginInstance> inst, const String& error)
        {
            if (auto* r = audioEngine.rackForNode (nodeId))
            {
                if (inst != nullptr)
                {
                    r->fill (id, std::move (inst));
                    if (stateB64.isNotEmpty())
                        r->setState (id, stateB64);
                }
                else
                {
                    r->markMissing (id);
                    Logger::writeToLog ("Node plugin load failed (" + nodeId + "/" + id + "): " + error);
                }
            }
            emitNodeRacks();
        });
}

void EngineController::pickNodeDeviceFile (const String& nodeId, const String& instanceId)
{
    chooser = std::make_unique<FileChooser> ("Add a plugin (.vst3)", File(), "*.vst3;*.component");
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this, nodeId, instanceId] (const FileChooser& fc)
        {
            const auto result = fc.getResult();
            if (result.exists())
                nodeDeviceAdd (nodeId, instanceId, "vst3", result.getFullPathName());
        });
}

void EngineController::loadSlotFromPath (int slot, const String& path)
{
    File file (path);
    PluginDescription desc;
    if (! pluginHost.describeFile (file, desc))
        return;

    pluginHost.createAsync (
        desc, audioEngine.getSampleRate(), audioEngine.getBlockSize(),
        [this, slot, path] (std::unique_ptr<AudioPluginInstance> inst, const String& error)
        {
            if (inst != nullptr)
            {
                audioEngine.installPlugin (slot, std::move (inst));
                pluginHost.setSlotPath (slot, path);
                pluginHost.saveConfig();

                // Apply any session state that arrived before this slot was ready.
                if (pendingPluginState[(size_t) slot].isNotEmpty())
                {
                    audioEngine.setPluginState (slot, pendingPluginState[(size_t) slot]);
                    pendingPluginState[(size_t) slot] = {};
                }
            }
            else
            {
                Logger::writeToLog ("Plugin load failed (" + path + "): " + error);
            }
            emitPluginStatuses();
        });
}

void EngineController::pickPluginFile (int slot)
{
    chooser = std::make_unique<FileChooser> ("Locate the plugin (.vst3)", File(), "*.vst3;*.component");
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this, slot] (const FileChooser& fc)
        {
            const auto result = fc.getResult();
            if (result.exists())
                loadSlotFromPath (slot, result.getFullPathName());
        });
}

void EngineController::pickSourceFile()
{
    chooser = std::make_unique<FileChooser> ("Choose an audio file", File(),
                                             "*.wav;*.aif;*.aiff;*.flac;*.mp3;*.ogg");
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this] (const FileChooser& fc)
        {
            const auto result = fc.getResult();
            if (result.exists())
                audioEngine.loadAudioFile (result);
        });
}

void EngineController::pickTrackFile (const String& trackId)
{
    chooser = std::make_unique<FileChooser> ("Choose audio for the track", File(),
                                             "*.wav;*.aif;*.aiff;*.flac;*.mp3;*.ogg");
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [this, trackId] (const FileChooser& fc)
        {
            const auto result = fc.getResult();
            if (result.exists())
            {
                audioEngine.assignTrackFile (trackId, result);
                emitTrackInfo();
            }
        });
}

// ---- session persistence ----

var EngineController::buildEnginePayload()
{
    auto* plugins = new DynamicObject();
    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
        plugins->setProperty (PluginHost::slotKey (slot), audioEngine.getPluginState (slot));

    auto* engineObj = new DynamicObject();
    engineObj->setProperty ("plugins", var (plugins));
    engineObj->setProperty ("tracks", audioEngine.buildTrackList());
    engineObj->setProperty ("nodes", audioEngine.buildNodeRackStates());
    return var (engineObj);
}

var EngineController::buildSession (const String& name, const var& uiPayload)
{
    auto* obj = new DynamicObject();
    obj->setProperty ("version", 3); // keep in lockstep with SESSION_VERSION (session.ts)
    obj->setProperty ("name", name);
    obj->setProperty ("savedAt", Time::getCurrentTime().toISO8601 (true));
    obj->setProperty ("ui", uiPayload);
    obj->setProperty ("engine", buildEnginePayload());
    return var (obj);
}

void EngineController::applyEnginePayload (const var& enginePayload)
{
    const auto* obj = enginePayload.getDynamicObject();
    if (obj == nullptr)
        return;

    // 1) Recreate tracks first so node racks/automation resolve to real channels.
    //    (v1/v2 sessions have no track list — those tracks are created on demand by
    //    the mixer commands the web replays via applySessionToEngine.)
    if (const auto* trackArr = obj->getProperty ("tracks").getArray())
        for (const auto& tv : *trackArr)
            if (const auto* t = tv.getDynamicObject())
            {
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

    // 2) Master chain plugins (fixed eq/tape/pre).
    if (const auto* plugins = obj->getProperty ("plugins").getDynamicObject())
        for (int slot = 0; slot < PluginHost::numSlots; ++slot)
        {
            const auto b64 = plugins->getProperty (PluginHost::slotKey (slot)).toString();
            if (b64.isEmpty())
                continue;
            // Apply now if the instance exists; otherwise defer until it loads.
            if (audioEngine.hasPlugin (slot))
                audioEngine.setPluginState (slot, b64);
            else
                pendingPluginState[(size_t) slot] = b64;
        }

    // 3) Per-node insert racks: instantiate each saved device into its node in chain
    //    order (a placeholder reserves order; the async load fills it) and restore
    //    its state on completion. v3 stores an ordered array per node; v2 stored a
    //    slot-keyed object ({ eq|tape|pre: state }) — handle both.
    auto restoreFromArray = [this] (const String& nodeId, const Array<var>& list)
    {
        for (const auto& dv : list)
            if (const auto* d = dv.getDynamicObject())
                nodeDeviceAdd (nodeId, d->getProperty ("id").toString(),
                               d->getProperty ("kind").toString(),
                               d->getProperty ("path").toString(),
                               d->getProperty ("state").toString());
    };
    if (auto* nodes = obj->getProperty ("nodes").getDynamicObject())
        for (const auto& np : nodes->getProperties())
        {
            if (const auto* list = np.value.getArray())
                restoreFromArray (np.name.toString(), *list);
            else if (auto* slots = np.value.getDynamicObject()) // v2 fallback
                for (const auto& sp : slots->getProperties())
                {
                    const auto key = sp.name.toString(); // "eq" | "tape" | "pre"
                    nodeDeviceAdd (np.name.toString(), key + "-" + Uuid().toString().substring (0, 8),
                                   key, {}, sp.value.toString());
                }
        }
}

void EngineController::sessionExport (const String& name, const var& uiPayload)
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

void EngineController::sessionImport()
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
            auto* payload = new DynamicObject();
            payload->setProperty ("name", obj->getProperty ("name"));
            payload->setProperty ("ui", obj->getProperty ("ui"));
            emit ("engineSessionImported", var (payload));
        });
}

var EngineController::handle (const String& name, const Array<var>& args)
{
    if (auto r = handleTransport   (name, args)) return *r;
    if (auto r = handleMixer       (name, args)) return *r;
    if (auto r = handleGroupSends  (name, args)) return *r;
    if (auto r = handleAutomation  (name, args)) return *r;
    if (auto r = handleNodeDevice  (name, args)) return *r;
    if (auto r = handleTrackSource (name, args)) return *r;
    if (auto r = handleDeviceChain (name, args)) return *r;
    if (auto r = handleAudioSource (name, args)) return *r;
    if (auto r = handleSession     (name, args)) return *r;
    return {};
}

// ---- transport ----
std::optional<var> EngineController::handleTransport (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "transportSetPlaying")   { audioEngine.setPlaying ((bool) arg (0)); return var(); }
    if (name == "transportStop")         { audioEngine.stop(); return var(); }
    if (name == "transportSetPosition")  { audioEngine.setPosition ((double) arg (0)); return var(); }
    if (name == "transportSetLooping")   { audioEngine.setLooping ((bool) arg (0)); return var(); }
    if (name == "transportSetRecording") { audioEngine.setRecording ((bool) arg (0)); return var(); }
    if (name == "transportSetTempo")     { audioEngine.setTempo ((double) arg (0)); return var(); }
    if (name == "transportSetLoopStart") { audioEngine.setLoopRegion ((double) arg (0), audioEngine.getLoopEnd()); return var(); }
    if (name == "transportSetLoopEnd")   { audioEngine.setLoopRegion (audioEngine.getLoopStart(), (double) arg (0)); return var(); }
    return std::nullopt;
}

// ---- mixer ----
std::optional<var> EngineController::handleMixer (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "mixerSetTrackVolume")  { audioEngine.setTrackGain (arg (0).toString(), (float) (double) arg (1)); return var(); }
    if (name == "mixerSetTrackPan")     { audioEngine.setTrackPan  (arg (0).toString(), (float) (double) arg (1)); return var(); }
    if (name == "mixerSetTrackMute")    { audioEngine.setTrackMute (arg (0).toString(), (bool) arg (1)); return var(); }
    if (name == "mixerSetTrackSolo")    { audioEngine.setTrackSolo (arg (0).toString(), (bool) arg (1)); return var(); }
    if (name == "mixerSetTrackArm")     { audioEngine.setTrackArm  (arg (0).toString(), (bool) arg (1)); return var(); }
    if (name == "mixerSetTrackGroup")   { audioEngine.setTrackGroup (arg (0).toString(), arg (1).toString()); return var(); }
    if (name == "mixerSetMasterVolume") { audioEngine.setMasterVolume ((float) (double) arg (0)); return var(); }
    if (name == "mixerSetMasterPan")    { audioEngine.setMasterPan ((float) (double) arg (0)); return var(); }
    return std::nullopt;
}

// ---- group sub-mix buses + aux sends / returns ----
std::optional<var> EngineController::handleGroupSends (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "groupSetGain") { audioEngine.setGroupGain (arg (0).toString(), (float) (double) arg (1)); return var(); }
    if (name == "groupSetPan")  { audioEngine.setGroupPan  (arg (0).toString(), (float) (double) arg (1)); return var(); }
    if (name == "groupSetMute") { audioEngine.setGroupMute (arg (0).toString(), (bool) arg (1)); return var(); }
    if (name == "groupSetSolo") { audioEngine.setGroupSolo (arg (0).toString(), (bool) arg (1)); return var(); }

    if (name == "mixerSetTrackSend") { audioEngine.setTrackSend (arg (0).toString(), (int) arg (1), (float) (double) arg (2)); return var(); }
    if (name == "returnSetGain")     { audioEngine.setReturnGain ((int) arg (0), (float) (double) arg (1)); return var(); }
    return std::nullopt;
}

// ---- parameter automation ----
std::optional<var> EngineController::handleAutomation (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "automationSet")
    {
        std::vector<AutomationStore::Point> pts;
        if (const auto* arr = arg (2).getArray())
        {
            pts.reserve ((size_t) arr->size());
            for (const auto& pv : *arr)
                pts.push_back ({ (double) pv.getProperty ("t", 0.0),
                                 (float) (double) pv.getProperty ("v", 0.0) });
        }
        audioEngine.setAutomation (arg (0).toString(), arg (1).toString(), std::move (pts));
        return var();
    }
    if (name == "automationClear")    { audioEngine.clearAutomation (arg (0).toString(), arg (1).toString()); return var(); }
    if (name == "automationClearAll") { audioEngine.clearAllAutomation(); return var(); }
    return std::nullopt;
}

// ---- per-node insert FX ----
std::optional<var> EngineController::handleNodeDevice (const String& name, const Array<var>& args)
{
    if (! name.startsWith ("nodeDevice"))
        return std::nullopt;

    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "nodeDeviceAdd")
    {
        const auto* d = arg (1).getDynamicObject();
        const String id   = d != nullptr ? d->getProperty ("id").toString()   : String();
        const String kind = d != nullptr ? d->getProperty ("kind").toString() : String();
        const String path = d != nullptr ? d->getProperty ("path").toString() : String();
        nodeDeviceAdd (arg (0).toString(), id, kind, path);
        return var();
    }
    if (name == "nodeDeviceListParams") { return nodeDeviceListParams (arg (0).toString(), arg (1).toString()); }
    if (name == "nodeDevicePickFile")   { pickNodeDeviceFile (arg (0).toString(), arg (1).toString()); return var(); }

    // remove / set-bypass / open / close editor all act on the same (rack, instance id).
    auto* r = audioEngine.rackForNode (arg (0).toString());
    const String inst = arg (1).toString();
    if (name == "nodeDeviceRemove")      { if (r != nullptr) { r->remove (inst); }                    emitNodeRacks(); return var(); }
    if (name == "nodeDeviceSetBypass")   { if (r != nullptr) { r->setBypass (inst, (bool) arg (2)); } emitNodeRacks(); return var(); }
    if (name == "nodeDeviceOpenEditor")  { if (r != nullptr) { r->openEditor (inst); }  return var(); }
    if (name == "nodeDeviceCloseEditor") { if (r != nullptr) { r->closeEditor (inst); } return var(); }
    return std::nullopt;
}

// ---- per-track audio source ----
std::optional<var> EngineController::handleTrackSource (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "trackCreate")     { audioEngine.createTrack (arg (0).toString(), arg (1).toString(), arg (2).toString(), arg (3).toString(), arg (4).toString()); emitTrackInfo(); return var(); }
    if (name == "trackDelete")     { audioEngine.destroyTrack (arg (0).toString()); emitTrackInfo(); emitNodeRacks(); return var(); }
    if (name == "trackAssignFile") { audioEngine.assignTrackFile (arg (0).toString(), File (arg (1).toString())); emitTrackInfo(); return var(); }
    if (name == "trackClearFile")  { audioEngine.clearTrackFile (arg (0).toString()); emitTrackInfo(); return var(); }
    if (name == "trackPickFile")   { pickTrackFile (arg (0).toString()); return var(); }
    return std::nullopt;
}

// ---- device chain + plugins ----
std::optional<var> EngineController::handleDeviceChain (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };
    const auto slotOf = [&arg] { return PluginHost::slotIndex (arg (0).toString()); };

    if (name == "deviceSetBypass")  { audioEngine.setBypassed (slotOf(), (bool) arg (1)); return var(); }
    if (name == "deviceSetParam")   { audioEngine.setParam (slotOf(), arg (1).toString(), (float) (double) arg (2)); return var(); }
    if (name == "deviceOpenEditor") { audioEngine.openEditor (slotOf()); return var(); }
    if (name == "deviceCloseEditor"){ audioEngine.closeEditor (slotOf()); return var(); }
    if (name == "deviceListParams") { return audioEngine.listParams (slotOf()); }

    if (name == "pluginsScan")    { pluginHost.scanDefaultLocations ([this] (int slot, File f) { if (! audioEngine.hasPlugin (slot)) loadSlotFromPath (slot, f.getFullPathName()); }); return var(); }
    if (name == "pluginsAssign")  { loadSlotFromPath (slotOf(), arg (1).toString()); return var(); }
    if (name == "pluginsPickFile"){ pickPluginFile (slotOf()); return var(); }
    if (name == "pluginsList")    { return pluginHost.listAllPlugins(); }
    return std::nullopt;
}

// ---- audio device settings + legacy single source ----
std::optional<var> EngineController::handleAudioSource (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "audioGetDevices")   { return audioEngine.getDevicesInfo(); }
    if (name == "audioSetSettings")  { audioEngine.applySettings (arg (0)); return audioEngine.getDevicesInfo(); }

    if (name == "sourcePickFile")    { pickSourceFile(); return var(); }
    if (name == "sourceSetInputMode"){ audioEngine.setInputMode (arg (0).toString()); return var(); }
    return std::nullopt;
}

// ---- session persistence ----
std::optional<var> EngineController::handleSession (const String& name, const Array<var>& args)
{
    const auto arg = [&args] (int i) { return i < args.size() ? args[i] : var(); };

    if (name == "sessionSave")
    {
        const auto sname = arg (0).toString();
        const bool ok = sessionStore.writeSession (sname, buildSession (sname, arg (1)));
        auto* r = new DynamicObject(); r->setProperty ("ok", ok); return var (r);
    }
    if (name == "sessionLoad")
    {
        const auto* obj = sessionStore.readSession (arg (0).toString()).getDynamicObject();
        if (obj == nullptr)
            return var();                               // not found
        applyEnginePayload (obj->getProperty ("engine"));
        return obj->getProperty ("ui");                 // hand UI state to the web
    }
    if (name == "sessionList")   { return sessionStore.listSessions(); }
    if (name == "sessionDelete")
    {
        auto* r = new DynamicObject();
        r->setProperty ("ok", sessionStore.deleteSession (arg (0).toString()));
        return var (r);
    }
    if (name == "sessionExport") { sessionExport (arg (0).toString(), arg (1)); return var(); }
    if (name == "sessionImport") { sessionImport(); return var(); }
    if (name == "prefsSave")     { sessionStore.writePrefs (arg (0)); return var(); }
    if (name == "prefsLoad")     { return sessionStore.readPrefs(); }
    return std::nullopt;
}

// { id: "dev:<instanceId>:<i>", name } for each param of a node's rack device, so
// the automation picker can use `id` directly as the paramId.
var EngineController::nodeDeviceListParams (const String& nodeId, const String& instanceId)
{
    Array<var> out;
    const auto* r = audioEngine.rackForNode (nodeId);
    const auto* inst = r != nullptr ? r->get (instanceId) : nullptr;
    if (inst != nullptr)
    {
        const auto& params = inst->getParameters();
        for (int i = 0; i < params.size(); ++i)
        {
            auto* obj = new DynamicObject();
            obj->setProperty ("id", "dev:" + instanceId + ":" + String (i));
            obj->setProperty ("name", params[i]->getName (64));
            out.add (var (obj));
        }
    }
    return var (out);
}
