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
    obj->setProperty ("levels", var (new DynamicObject())); // per-track meters: Phase 3
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

    // ---- source / audio settings (mixer + audioSetSettings: Phase 2) ----
    if (name == "sourcePickFile")   { pickSourceFile(); return {}; }
    if (name == "sourceSetInputMode"){ audioEngine.setInputMode (arg (0).toString()); return {}; }

    // Unhandled commands (mixer*, audioGetDevices, audioSetSettings) are accepted as
    // no-ops for now; they land in later phases.
    return {};
}
