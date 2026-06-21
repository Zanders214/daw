#include "EngineController.h"

using namespace juce;

EngineController::EngineController() {}
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

void EngineController::nodeDeviceAdd (const String& nodeId, const String& key, const String& stateB64)
{
    const int slot = PluginHost::slotIndex (key);
    if (slot < 0)
        return;

    const auto path = pluginHost.getSlotPath (slot);
    if (path.isEmpty() || ! File (path).exists())
        return;

    PluginDescription desc;
    if (! pluginHost.describeFile (File (path), desc))
        return;

    pluginHost.createAsync (
        desc, audioEngine.getSampleRate(), audioEngine.getBlockSize(),
        [this, nodeId, key, slot, stateB64] (std::unique_ptr<AudioPluginInstance> inst, const String& error)
        {
            if (inst != nullptr)
            {
                if (auto* rack = audioEngine.ensureNodeRack (nodeId))
                {
                    rack->install (slot, std::move (inst));
                    if (stateB64.isNotEmpty())
                        rack->setState (slot, stateB64);
                }
            }
            else
            {
                Logger::writeToLog ("Node plugin load failed (" + nodeId + "/" + key + "): " + error);
            }
            emitNodeRacks();
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
    engineObj->setProperty ("nodes", audioEngine.buildNodeRackStates());
    return var (engineObj);
}

var EngineController::buildSession (const String& name, const var& uiPayload)
{
    auto* obj = new DynamicObject();
    obj->setProperty ("version", 2); // keep in lockstep with SESSION_VERSION (session.ts)
    obj->setProperty ("name", name);
    obj->setProperty ("savedAt", Time::getCurrentTime().toISO8601 (true));
    obj->setProperty ("ui", uiPayload);
    obj->setProperty ("engine", buildEnginePayload());
    return var (obj);
}

void EngineController::applyEnginePayload (const var& enginePayload)
{
    auto* obj = enginePayload.getDynamicObject();
    if (obj == nullptr)
        return;

    auto* plugins = obj->getProperty ("plugins").getDynamicObject();
    if (plugins == nullptr)
        return;

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

    // Per-node insert racks: instantiate each saved device into its node (async)
    // and restore its state on completion.
    if (auto* nodes = obj->getProperty ("nodes").getDynamicObject())
        for (const auto& np : nodes->getProperties())
            if (auto* slots = np.value.getDynamicObject())
                for (const auto& sp : slots->getProperties())
                    nodeDeviceAdd (np.name.toString(), sp.name.toString(), sp.value.toString());
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

            auto* obj = JSON::parse (result).getDynamicObject();
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
    const auto arg = [&args] (int i) -> var { return i < args.size() ? args[i] : var(); };
    const auto slotOf = [&arg] { return PluginHost::slotIndex (arg (0).toString()); };

    // ---- transport ----
    if (name == "transportSetPlaying")  { audioEngine.setPlaying ((bool) arg (0)); return {}; }
    if (name == "transportStop")        { audioEngine.stop(); return {}; }
    if (name == "transportSetPosition") { audioEngine.setPosition ((double) arg (0)); return {}; }
    if (name == "transportSetLooping")  { audioEngine.setLooping ((bool) arg (0)); return {}; }
    if (name == "transportSetRecording"){ audioEngine.setRecording ((bool) arg (0)); return {}; }
    if (name == "transportSetTempo")    { audioEngine.setTempo ((double) arg (0)); return {}; }
    if (name == "transportSetLoopStart"){ audioEngine.setLoopRegion ((double) arg (0), audioEngine.getLoopEnd()); return {}; }
    if (name == "transportSetLoopEnd")  { audioEngine.setLoopRegion (audioEngine.getLoopStart(), (double) arg (0)); return {}; }

    // ---- mixer ----
    if (name == "mixerSetTrackVolume")  { audioEngine.setTrackGain (arg (0).toString(), (float) (double) arg (1)); return {}; }
    if (name == "mixerSetTrackPan")     { audioEngine.setTrackPan  (arg (0).toString(), (float) (double) arg (1)); return {}; }
    if (name == "mixerSetTrackMute")    { audioEngine.setTrackMute (arg (0).toString(), (bool) arg (1)); return {}; }
    if (name == "mixerSetTrackSolo")    { audioEngine.setTrackSolo (arg (0).toString(), (bool) arg (1)); return {}; }
    if (name == "mixerSetTrackArm")     { audioEngine.setTrackArm  (arg (0).toString(), (bool) arg (1)); return {}; }
    if (name == "mixerSetTrackGroup")   { audioEngine.setTrackGroup (arg (0).toString(), arg (1).toString()); return {}; }
    if (name == "mixerSetMasterVolume") { audioEngine.setMasterVolume ((float) (double) arg (0)); return {}; }
    if (name == "mixerSetMasterPan")    { audioEngine.setMasterPan ((float) (double) arg (0)); return {}; }

    // ---- group sub-mix buses ----
    if (name == "groupSetGain") { audioEngine.setGroupGain (arg (0).toString(), (float) (double) arg (1)); return {}; }
    if (name == "groupSetPan")  { audioEngine.setGroupPan  (arg (0).toString(), (float) (double) arg (1)); return {}; }
    if (name == "groupSetMute") { audioEngine.setGroupMute (arg (0).toString(), (bool) arg (1)); return {}; }
    if (name == "groupSetSolo") { audioEngine.setGroupSolo (arg (0).toString(), (bool) arg (1)); return {}; }

    // ---- aux sends / returns ----
    if (name == "mixerSetTrackSend") { audioEngine.setTrackSend (arg (0).toString(), (int) arg (1), (float) (double) arg (2)); return {}; }
    if (name == "returnSetGain")     { audioEngine.setReturnGain ((int) arg (0), (float) (double) arg (1)); return {}; }

    // ---- parameter automation ----
    if (name == "automationSet")
    {
        std::vector<AutomationStore::Point> pts;
        if (auto* arr = arg (2).getArray())
        {
            pts.reserve ((size_t) arr->size());
            for (const auto& pv : *arr)
                pts.push_back ({ (double) pv.getProperty ("t", 0.0),
                                 (float) (double) pv.getProperty ("v", 0.0) });
        }
        audioEngine.setAutomation (arg (0).toString(), arg (1).toString(), std::move (pts));
        return {};
    }
    if (name == "automationClear")    { audioEngine.clearAutomation (arg (0).toString(), arg (1).toString()); return {}; }
    if (name == "automationClearAll") { audioEngine.clearAllAutomation(); return {}; }

    // ---- per-node insert FX ----
    if (name == "nodeDeviceAdd")    { nodeDeviceAdd (arg (0).toString(), arg (1).toString()); return {}; }
    if (name == "nodeDeviceRemove") { if (auto* r = audioEngine.rackForNode (arg (0).toString())) r->remove (PluginHost::slotIndex (arg (1).toString())); emitNodeRacks(); return {}; }
    if (name == "nodeDeviceSetBypass") { if (auto* r = audioEngine.rackForNode (arg (0).toString())) r->setBypass (PluginHost::slotIndex (arg (1).toString()), (bool) arg (2)); emitNodeRacks(); return {}; }
    if (name == "nodeDeviceOpenEditor")  { if (auto* r = audioEngine.rackForNode (arg (0).toString())) r->openEditor (PluginHost::slotIndex (arg (1).toString())); return {}; }
    if (name == "nodeDeviceCloseEditor") { if (auto* r = audioEngine.rackForNode (arg (0).toString())) r->closeEditor (PluginHost::slotIndex (arg (1).toString())); return {}; }
    if (name == "nodeDeviceListParams")
    {
        // { id: "dev:<slot>:<i>", name } for each param of a node's rack slot,
        // so the automation picker can use `id` directly as the paramId.
        Array<var> out;
        const int slot = PluginHost::slotIndex (arg (1).toString());
        if (auto* r = audioEngine.rackForNode (arg (0).toString()))
            if (auto* inst = r->get (slot))
            {
                const auto& params = inst->getParameters();
                for (int i = 0; i < params.size(); ++i)
                {
                    auto* obj = new DynamicObject();
                    obj->setProperty ("id", "dev:" + String (slot) + ":" + String (i));
                    obj->setProperty ("name", params[i]->getName (64));
                    out.add (var (obj));
                }
            }
        return var (out);
    }

    // ---- per-track audio source ----
    if (name == "trackAssignFile") { audioEngine.assignTrackFile (arg (0).toString(), File (arg (1).toString())); emitTrackInfo(); return {}; }
    if (name == "trackClearFile")  { audioEngine.clearTrackFile (arg (0).toString()); emitTrackInfo(); return {}; }
    if (name == "trackPickFile")   { pickTrackFile (arg (0).toString()); return {}; }

    // ---- device chain ----
    if (name == "deviceSetBypass") { audioEngine.setBypassed (slotOf(), (bool) arg (1)); return {}; }
    if (name == "deviceSetParam")  { audioEngine.setParam (slotOf(), arg (1).toString(), (float) (double) arg (2)); return {}; }
    if (name == "deviceOpenEditor"){ audioEngine.openEditor (slotOf()); return {}; }
    if (name == "deviceCloseEditor"){ audioEngine.closeEditor (slotOf()); return {}; }
    if (name == "deviceListParams"){ return audioEngine.listParams (slotOf()); }

    // ---- plugins ----
    if (name == "pluginsScan")   { pluginHost.scanDefaultLocations ([this] (int slot, File f) { if (! audioEngine.hasPlugin (slot)) loadSlotFromPath (slot, f.getFullPathName()); }); return {}; }
    if (name == "pluginsAssign") { loadSlotFromPath (slotOf(), arg (1).toString()); return {}; }
    if (name == "pluginsPickFile"){ pickPluginFile (slotOf()); return {}; }

    // ---- audio device settings ----
    if (name == "audioGetDevices")  { return audioEngine.getDevicesInfo(); }
    if (name == "audioSetSettings") { audioEngine.applySettings (arg (0)); return audioEngine.getDevicesInfo(); }

    // ---- legacy single source ----
    if (name == "sourcePickFile")   { pickSourceFile(); return {}; }
    if (name == "sourceSetInputMode"){ audioEngine.setInputMode (arg (0).toString()); return {}; }

    // ---- session persistence ----
    if (name == "sessionSave")
    {
        const auto sname = arg (0).toString();
        const bool ok = sessionStore.writeSession (sname, buildSession (sname, arg (1)));
        auto* r = new DynamicObject(); r->setProperty ("ok", ok); return var (r);
    }
    if (name == "sessionLoad")
    {
        auto* obj = sessionStore.readSession (arg (0).toString()).getDynamicObject();
        if (obj == nullptr)
            return {};                                  // not found
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
    if (name == "sessionExport") { sessionExport (arg (0).toString(), arg (1)); return {}; }
    if (name == "sessionImport") { sessionImport(); return {}; }
    if (name == "prefsSave")     { sessionStore.writePrefs (arg (0)); return {}; }
    if (name == "prefsLoad")     { return sessionStore.readPrefs(); }

    return {};
}
