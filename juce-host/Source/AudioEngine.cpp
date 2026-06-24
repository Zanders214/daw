#include "AudioEngine.h"
#include "PluginEditorWindow.h"
#include "PluginHost.h"

using namespace juce;

AudioEngine::AudioEngine()
{
    audioFormatManager.registerBasicFormats();
}

AudioEngine::~AudioEngine()
{
    shutdown();
}

void AudioEngine::initialise()
{
    readThread.startThread();
    deviceManager.initialiseWithDefaultDevices (2, 2);
    deviceManager.addAudioCallback (this);
}

void AudioEngine::shutdown()
{
    deviceManager.removeAudioCallback (this);
    for (int i = 0; i < numSlots; ++i)
        closeEditor (i);

    {
        const ScopedLock sl (chainLock);
        for (const auto& p : chain)
            if (p != nullptr)
                p->releaseResources();
    }

    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
        {
            t->resyncClips();
            t->clearFile();
            t->releaseResources();
        }
        tracks.clear();
        trackById.clear();
    }
    readThread.stopThread (2000);

    transportSource.setSource (nullptr);
    readerSource.reset();
}

// ---- transport ----
double AudioEngine::beatsToSeconds (double beats) const
{
    return beats * 60.0 / jmax (1.0, tempo.load());
}

void AudioEngine::setPlaying (bool shouldPlay)
{
    playing.store (shouldPlay);
    if (inputMode == "file")
    {
        if (shouldPlay) transportSource.start();
        else            transportSource.stop();
    }

    // Drop clips out of their playing state; the audio callback re-enters each one
    // at the right offset on the next block (handles both play and pause).
    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
        t->resyncClips();
}

void AudioEngine::stop()
{
    playing.store (false);
    transportSource.stop();
    transportSource.setPosition (0.0);
    playheadBeats.store (0.0);

    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
        t->resyncClips();
}

void AudioEngine::setPosition (double beats)
{
    const double b = jlimit (0.0, totalBeats, beats);
    playheadBeats.store (b);

    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
        t->resyncClips();
}

// ---- source ----
bool AudioEngine::loadAudioFile (const File& file)
{
    auto* reader = audioFormatManager.createReaderFor (file);
    if (reader == nullptr)
        return false;

    auto newSource = std::make_unique<AudioFormatReaderSource> (reader, true);
    transportSource.setSource (newSource.get(), 0, nullptr, reader->sampleRate);
    readerSource = std::move (newSource);
    fileLoaded.store (true);
    return true;
}

void AudioEngine::setInputMode (const String& mode)
{
    inputMode = mode;
}

// ---- audio device settings ----
var AudioEngine::getDevicesInfo() const
{
    DynamicObject::Ptr obj = new DynamicObject();

    AudioDeviceManager::AudioDeviceSetup setup;
    deviceManager.getAudioDeviceSetup (setup);
    obj->setProperty ("outputDevice", setup.outputDeviceName);
    obj->setProperty ("inputDevice", setup.inputDeviceName);
    obj->setProperty ("sampleRate", setup.sampleRate);
    obj->setProperty ("bufferSize", setup.bufferSize);

    Array<var> rates;
    Array<var> sizes;
    Array<var> outputs;
    if (auto* dev = deviceManager.getCurrentAudioDevice())
    {
        for (auto r : dev->getAvailableSampleRates()) rates.add (r);
        for (auto b : dev->getAvailableBufferSizes()) sizes.add (b);
    }
    if (auto* type = deviceManager.getCurrentDeviceTypeObject())
    {
        type->scanForDevices();
        for (const auto& n : type->getDeviceNames (false)) outputs.add (n);
    }
    obj->setProperty ("sampleRates", rates);
    obj->setProperty ("bufferSizes", sizes);
    obj->setProperty ("outputs", outputs);
    return var (obj.get());
}

void AudioEngine::applySettings (const var& opts)
{
    AudioDeviceManager::AudioDeviceSetup setup;
    deviceManager.getAudioDeviceSetup (setup);

    if (opts.hasProperty ("sampleRate")) setup.sampleRate = (double) opts.getProperty ("sampleRate", setup.sampleRate);
    if (opts.hasProperty ("bufferSize")) setup.bufferSize = (int)    opts.getProperty ("bufferSize", setup.bufferSize);
    if (opts.hasProperty ("outputDevice"))
    {
        setup.outputDeviceName = opts.getProperty ("outputDevice", setup.outputDeviceName).toString();
        setup.useDefaultOutputChannels = true;
    }

    const String err = deviceManager.setAudioDeviceSetup (setup, true);
    if (err.isNotEmpty())
        Logger::writeToLog ("Audio device setup error: " + err);
}

// ---- loop region ----
void AudioEngine::setLoopRegion (double startBeats, double endBeats)
{
    loopStartBeats.store (jlimit (0.0, totalBeats, startBeats));
    loopEndBeats.store   (jlimit (0.0, totalBeats, endBeats));
}

// ---- mixer (multitrack) ----
TrackChannel& AudioEngine::ensureTrack (const String& id)
{
    const ScopedLock sl (tracksLock);
    if (auto* existing = trackById[id])
        return *existing;

    auto* ch = tracks.add (new TrackChannel (id));
    trackById.set (id, ch);
    if (currentSampleRate > 0.0)
        ch->prepare (currentSampleRate, currentBlockSize);
    return *ch;
}

void AudioEngine::recomputeAnySolo()
{
    const ScopedLock sl (tracksLock);
    int count = 0;
    for (const auto* t : tracks)
        if (t->solo.load())
            ++count;
    anySolo.store (count);
}

void AudioEngine::setTrackGain (const String& id, float gainLinear) { ensureTrack (id).gain.store (jlimit (0.0f, 4.0f, gainLinear)); }
void AudioEngine::setTrackPan  (const String& id, float pan)        { ensureTrack (id).pan.store (jlimit (0.0f, 1.0f, pan)); }
void AudioEngine::setTrackMute (const String& id, bool muted)       { ensureTrack (id).mute.store (muted); }
void AudioEngine::setTrackSolo (const String& id, bool soloed)      { ensureTrack (id).solo.store (soloed); recomputeAnySolo(); }
void AudioEngine::setTrackArm  (const String& id, bool armed)       { ensureTrack (id).arm.store (armed); }

void AudioEngine::createTrack (const String& id, const String& name, const String& type,
                               const String& color, const String& group)
{
    auto& t = ensureTrack (id);
    t.setMeta (name, type, color);
    t.group.store (group.isEmpty() ? nullptr : &ensureGroup (group));
}

void AudioEngine::destroyTrack (const String& id)
{
    // Remove this node's envelopes first, so no automation target keeps a pointer
    // into the rack we are about to free (the keys are "<id>|<paramId>").
    automation.clearForNode (id);

    TrackChannel* doomed = nullptr;
    {
        const ScopedLock sl (tracksLock);
        doomed = trackById[id];
    }
    if (doomed == nullptr)
        return;

    doomed->inserts.closeAllEditors(); // message thread, before the track is freed

    {
        const ScopedLock sl (tracksLock);
        doomed->resyncClips();
        doomed->clearFile();
        doomed->releaseResources();
        trackById.remove (id);
        tracks.removeObject (doomed); // OwnedArray deletes it
    }
    recomputeAnySolo();
}

var AudioEngine::buildTrackList() const
{
    Array<var> out;
    const ScopedLock sl (tracksLock);
    for (const auto* t : tracks)
    {
        DynamicObject::Ptr o = new DynamicObject();
        o->setProperty ("id", t->getId());
        o->setProperty ("name", t->displayName);
        o->setProperty ("type", t->type);
        o->setProperty ("color", t->color);
        const auto* g = t->group.load();
        o->setProperty ("group", g != nullptr ? g->getId() : String());
        o->setProperty ("filePath", t->getFilePath());
        out.add (var (o.get()));
    }
    return var (out);
}

GroupBus& AudioEngine::ensureGroup (const String& id)
{
    const ScopedLock sl (tracksLock);
    if (auto* existing = groupById[id])
        return *existing;

    auto* g = groups.add (new GroupBus (id));
    groupById.set (id, g);
    if (currentSampleRate > 0.0)
        g->prepare (currentSampleRate, currentBlockSize);
    return *g;
}

void AudioEngine::recomputeAnyGroupSolo()
{
    const ScopedLock sl (tracksLock);
    int count = 0;
    for (const auto* g : groups)
        if (g->solo.load())
            ++count;
    anyGroupSolo.store (count);
}

void AudioEngine::setTrackGroup (const String& trackId, const String& groupId)
{
    auto& t = ensureTrack (trackId);
    t.group.store (groupId.isEmpty() ? nullptr : &ensureGroup (groupId));
}

void AudioEngine::setGroupGain (const String& groupId, float gainLinear) { ensureGroup (groupId).gain.store (jlimit (0.0f, 4.0f, gainLinear)); }
void AudioEngine::setGroupPan  (const String& groupId, float pan)        { ensureGroup (groupId).pan.store (jlimit (0.0f, 1.0f, pan)); }
void AudioEngine::setGroupMute (const String& groupId, bool muted)       { ensureGroup (groupId).mute.store (muted); }
void AudioEngine::setGroupSolo (const String& groupId, bool soloed)      { ensureGroup (groupId).solo.store (soloed); recomputeAnyGroupSolo(); }

var AudioEngine::buildGroupLevels() const
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (const auto* g : groups)
            obj->setProperty (Identifier (g->getId()), (double) g->level.load());
    return var (obj.get());
}

void AudioEngine::setTrackSend (const String& trackId, int sendIdx, float amount)
{
    if (isPositiveAndBelow (sendIdx, numSends))
        ensureTrack (trackId).sends[(size_t) sendIdx].store (jlimit (0.0f, 1.0f, amount));
}

void AudioEngine::setReturnGain (int sendIdx, float gainLinear)
{
    if (isPositiveAndBelow (sendIdx, numSends))
        returnGain[(size_t) sendIdx].store (jlimit (0.0f, 4.0f, gainLinear));
}

var AudioEngine::buildReturnLevels()
{
    Array<var> out;
    for (int i = 0; i < numSends; ++i)
        out.add ((double) returnLevel[(size_t) i].load());
    return out;
}

void AudioEngine::setAutomation (const String& nodeId, const String& paramId,
                                 std::vector<AutomationStore::Point> points)
{
    automation.set (nodeId + "|" + paramId, std::move (points), resolveAutoTarget (nodeId, paramId));
}

void AudioEngine::clearAutomation (const String& nodeId, const String& paramId)
{
    automation.clear (nodeId + "|" + paramId);
}

void AudioEngine::clearAllAutomation() { automation.clearAll(); }

AutomationStore::Target AudioEngine::resolveAutoTarget (const String& nodeId, const String& paramId)
{
    AutomationStore::Target t;
    const auto f32 = [&t] (std::atomic<float>* p, float lo, float hi)
    {
        t.kind = AutomationStore::Kind::f32;
        t.f32 = p;
        t.lo = lo;
        t.hi = hi;
        return t;
    };

    // Device (plugin) param: "dev:<instanceId>:<index>" on any node with a rack
    // (track / group / return). The rack pointer is stable; the instance is
    // looked up by id under its lock at apply time, so a removed device just no-ops.
    if (paramId.startsWith ("dev:"))
    {
        if (auto toks = StringArray::fromTokens (paramId, ":", ""); toks.size() == 3)
            if (auto* rack = rackForNode (nodeId))
            {
                t.kind = AutomationStore::Kind::param;
                t.rack = rack;
                t.deviceId = toks[1];
                t.paramIndex = toks[2].getIntValue();
            }
        return t;
    }

    if (nodeId == "master")
    {
        if (paramId == "mvol") return f32 (&masterVolume, 0.0f, 2.0f);
        if (paramId == "mpan") return f32 (&masterPan,    0.0f, 1.0f);
        return t;
    }
    if (nodeId.startsWith ("return-"))
    {
        if (const int i = nodeId.fromFirstOccurrenceOf ("return-", false, false).getIntValue();
            paramId == "rgain" && isPositiveAndBelow (i, numSends))
            return f32 (&returnGain[(size_t) i], 0.0f, 4.0f);
        return t;
    }
    if (nodeId.startsWith ("g-"))
    {
        auto& g = ensureGroup (nodeId);
        if (paramId == "vol") return f32 (&g.gain, 0.0f, 4.0f);
        if (paramId == "pan") return f32 (&g.pan,  0.0f, 1.0f);
        return t;
    }

    auto& tr = ensureTrack (nodeId);
    if (paramId == "vol")   return f32 (&tr.gain,     0.0f, 4.0f);
    if (paramId == "pan")   return f32 (&tr.pan,      0.0f, 1.0f);
    if (paramId == "sendA") return f32 (&tr.sends[0], 0.0f, 1.0f);
    if (paramId == "sendB") return f32 (&tr.sends[1], 0.0f, 1.0f);
    return t; // unknown / device param (stage 4) → inert
}

DeviceRack* AudioEngine::rackForNode (const String& nodeId)
{
    if (nodeId.startsWith ("return-"))
    {
        const int i = nodeId.fromFirstOccurrenceOf ("return-", false, false).getIntValue();
        return isPositiveAndBelow (i, numSends) ? &returnRacks[(size_t) i] : nullptr;
    }
    const ScopedLock sl (tracksLock);
    if (auto* g = groupById[nodeId]) return &g->inserts;
    if (auto* t = trackById[nodeId]) return &t->inserts;
    return nullptr;
}

DeviceRack* AudioEngine::ensureNodeRack (const String& nodeId)
{
    if (nodeId.startsWith ("return-"))
        return rackForNode (nodeId);
    // Group ids are "g-..." in the UI seed; everything else is a track id.
    if (nodeId.startsWith ("g-"))
        return &ensureGroup (nodeId).inserts;
    return &ensureTrack (nodeId).inserts;
}

var AudioEngine::buildNodeRacks()
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedLock sl (tracksLock);

    auto addRack = [obj] (const String& nodeId, const DeviceRack& r)
    {
        Array<var> list;
        r.forEach ([&list] (const DeviceRack::Device& d)
        {
            DynamicObject::Ptr o = new DynamicObject();
            o->setProperty ("id", d.id);
            o->setProperty ("kind", d.kind);
            o->setProperty ("name", d.name);
            o->setProperty ("bypassed", d.bypassed.load());
            if (d.path.isNotEmpty()) o->setProperty ("path", d.path);
            if (d.missing)           o->setProperty ("missing", true);
            list.add (var (o.get()));
        });
        if (! list.isEmpty())
            obj->setProperty (Identifier (nodeId), var (list));
    };

    for (const auto* t : tracks) addRack (t->getId(), t->inserts);
    for (const auto* g : groups) addRack (g->getId(), g->inserts);
    for (int i = 0; i < numSends; ++i) addRack ("return-" + String (i), returnRacks[(size_t) i]);
    return var (obj.get());
}

var AudioEngine::buildNodeRackStates()
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedLock sl (tracksLock);

    auto addRack = [obj] (const String& nodeId, const DeviceRack& r)
    {
        Array<var> list;
        r.forEach ([&list, &r] (const DeviceRack::Device& d)
        {
            DynamicObject::Ptr o = new DynamicObject();
            o->setProperty ("id", d.id);
            o->setProperty ("kind", d.kind);
            if (d.path.isNotEmpty()) o->setProperty ("path", d.path);
            o->setProperty ("bypassed", d.bypassed.load());
            o->setProperty ("state", r.getState (d.id));
            list.add (var (o.get()));
        });
        if (! list.isEmpty())
            obj->setProperty (Identifier (nodeId), var (list));
    };

    for (const auto* t : tracks) addRack (t->getId(), t->inserts);
    for (const auto* g : groups) addRack (g->getId(), g->inserts);
    for (int i = 0; i < numSends; ++i) addRack ("return-" + String (i), returnRacks[(size_t) i]);
    return var (obj.get());
}

bool AudioEngine::assignTrackFile (const String& id, const File& file)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock); // serialize the source swap against the audio thread
    // The next audio block enters the (full-span) clip at the current playhead.
    return ch.loadFile (audioFormatManager, readThread, file);
}

void AudioEngine::setTrackClips (const String& id, const std::vector<TrackChannel::ClipSpec>& clips)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock);
    ch.setClips (audioFormatManager, readThread, clips);
}

void AudioEngine::setTrackMidiNotes (const String& id, std::vector<TrackChannel::MidiNoteSpec> notes)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock);
    ch.setMidiNotes (std::move (notes));
}

void AudioEngine::clearTrackFile (const String& id) const
{
    const ScopedLock sl (tracksLock);
    if (auto* t = trackById[id])
        t->clearFile();
}

var AudioEngine::buildTrackLevels() const
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (const auto* t : tracks)
            obj->setProperty (Identifier (t->getId()), (double) t->level.load());
    return var (obj.get());
}

var AudioEngine::buildTrackInfo() const
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedLock sl (tracksLock);
    for (const auto* t : tracks)
    {
        DynamicObject::Ptr s = new DynamicObject();
        s->setProperty ("loaded", t->hasFile());
        s->setProperty ("name", t->getFileName());
        s->setProperty ("path", t->getFilePath());
        s->setProperty ("displayName", t->displayName);
        s->setProperty ("type", t->type);
        s->setProperty ("color", t->color);
        const auto* g = t->group.load();
        s->setProperty ("group", g != nullptr ? g->getId() : String());
        obj->setProperty (Identifier (t->getId()), var (s.get()));
    }
    return var (obj.get());
}

// ---- plugin chain ----
AudioPluginInstance* AudioEngine::getInstance (int slot) const
{
    if (slot < 0 || slot >= numSlots) return nullptr;
    return chain[(size_t) slot].get();
}

void AudioEngine::prepareSlot (int slot) const
{
    if (auto* inst = getInstance (slot))
    {
        inst->enableAllBuses();
        inst->setPlayConfigDetails (2, 2, currentSampleRate, currentBlockSize);
        inst->prepareToPlay (currentSampleRate, currentBlockSize);
    }
}

void AudioEngine::installPlugin (int slot, std::unique_ptr<AudioPluginInstance> instance)
{
    if (slot < 0 || slot >= numSlots)
        return;

    {
        const ScopedLock sl (chainLock);
        if (chain[(size_t) slot] != nullptr)
            chain[(size_t) slot]->releaseResources();
        chain[(size_t) slot] = std::move (instance);
    }
    prepareSlot (slot);
}

void AudioEngine::removePlugin (int slot)
{
    if (slot < 0 || slot >= numSlots)
        return;
    closeEditor (slot);
    const ScopedLock sl (chainLock);
    if (chain[(size_t) slot] != nullptr)
        chain[(size_t) slot]->releaseResources();
    chain[(size_t) slot].reset();
}

bool AudioEngine::hasPlugin (int slot) const { return getInstance (slot) != nullptr; }

String AudioEngine::getPluginName (int slot) const
{
    const auto* inst = getInstance (slot);
    return inst != nullptr ? inst->getName() : String();
}

void AudioEngine::setBypassed (int slot, bool b)
{
    if (slot >= 0 && slot < numSlots)
        bypassed[(size_t) slot].store (b);
}

void AudioEngine::setParam (int slot, const String& paramId, float value01) const
{
    const auto* inst = getInstance (slot);
    if (inst == nullptr)
        return;

    const auto& params = inst->getParameters();

    // Resolve by numeric index first, then by (partial) name match.
    int index = paramId.containsOnly ("0123456789") ? paramId.getIntValue() : -1;
    if (index < 0)
        for (int i = 0; i < params.size(); ++i)
            if (params[i]->getName (64).containsIgnoreCase (paramId))
                { index = i; break; }

    if (isPositiveAndBelow (index, params.size()))
        params[index]->setValueNotifyingHost (jlimit (0.0f, 1.0f, value01));
}

var AudioEngine::listParams (int slot) const
{
    Array<var> out;
    if (const auto* inst = getInstance (slot))
    {
        const auto& params = inst->getParameters();
        for (int i = 0; i < params.size(); ++i)
        {
            DynamicObject::Ptr obj = new DynamicObject();
            obj->setProperty ("id", String (i));
            obj->setProperty ("name", params[i]->getName (64));
            obj->setProperty ("value", params[i]->getValue());
            obj->setProperty ("text", params[i]->getText (params[i]->getValue(), 0));
            out.add (var (obj.get()));
        }
    }
    return out;
}

String AudioEngine::getPluginState (int slot) const
{
    auto* inst = getInstance (slot);
    if (inst == nullptr)
        return {};

    // Guard against a concurrent processBlock (audio thread try-locks chainLock).
    const ScopedLock sl (chainLock);
    juce::MemoryBlock mb;
    inst->getStateInformation (mb);
    return mb.toBase64Encoding();
}

bool AudioEngine::setPluginState (int slot, const String& base64) const
{
    auto* inst = getInstance (slot);
    if (inst == nullptr || base64.isEmpty())
        return false;

    juce::MemoryBlock mb;
    if (! mb.fromBase64Encoding (base64) || mb.isEmpty())
        return false;

    const ScopedLock sl (chainLock);
    inst->setStateInformation (mb.getData(), (int) mb.getSize());
    return true;
}

void AudioEngine::openEditor (int slot)
{
    auto* inst = getInstance (slot);
    if (inst == nullptr)
        return;

    if (editorWindows[(size_t) slot] != nullptr)
    {
        editorWindows[(size_t) slot]->toFront (true);
        return;
    }

    auto window = std::make_unique<PluginEditorWindow> (inst->getName());
    if (inst->hasEditor())
    {
        if (auto* editor = inst->createEditorIfNeeded())
            window->setContentNonOwned (editor, true);
        else
            window->setContentOwned (new GenericAudioProcessorEditor (*inst), true);
    }
    else
    {
        window->setContentOwned (new GenericAudioProcessorEditor (*inst), true);
    }

    window->onCloseCallback = [this, slot] { closeEditor (slot); };
    window->setResizable (true, false);
    window->centreWithSize (window->getWidth(), window->getHeight());
    window->setVisible (true);
    editorWindows[(size_t) slot] = std::move (window);
}

void AudioEngine::closeEditor (int slot)
{
    if (slot < 0 || slot >= numSlots)
        return;
    if (editorWindows[(size_t) slot] != nullptr)
    {
        editorWindows[(size_t) slot]->clearContentComponent();
        editorWindows[(size_t) slot].reset();
    }
}

// ---- audio callback ----
void AudioEngine::audioDeviceAboutToStart (AudioIODevice* device)
{
    currentSampleRate = device->getCurrentSampleRate();
    currentBlockSize  = device->getCurrentBufferSizeSamples();
    scratch.setSize (2, currentBlockSize, false, false, true);

    transportSource.prepareToPlay (currentBlockSize, currentSampleRate);

    {
        const ScopedLock sl (chainLock);
        for (int i = 0; i < numSlots; ++i)
            prepareSlot (i);
    }
    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
            t->prepare (currentSampleRate, currentBlockSize);
        for (auto* g : groups)
            g->prepare (currentSampleRate, currentBlockSize);
    }

    for (auto& sb : sendBuses)
        sb.setSize (2, currentBlockSize, false, false, true);
    for (auto& r : returnRacks)
        r.prepare (currentSampleRate, currentBlockSize);
}

void AudioEngine::audioDeviceStopped()
{
    transportSource.releaseResources();
    {
        const ScopedLock sl (chainLock);
        for (const auto& p : chain)
            if (p != nullptr)
                p->releaseResources();
    }
    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
            t->releaseResources();
        for (const auto* g : groups)
            g->inserts.release();
    }
    for (const auto& r : returnRacks)
        r.release();
}

void AudioEngine::audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                                    int numInputChannels,
                                                    float* const* outputChannelData,
                                                    int numOutputChannels,
                                                    int numSamples,
                                                    const AudioIODeviceCallbackContext&)
{
    scratch.setSize (2, numSamples, false, false, true);
    scratch.clear(); // master bus accumulator

    // 1) Legacy single source (Phase 1 path: file player or input monitor).
    if (inputMode == "file" && fileLoaded.load())
    {
        AudioSourceChannelInfo info (&scratch, 0, numSamples);
        transportSource.getNextAudioBlock (info); // silent when stopped
    }
    else if (inputMode == "input")
    {
        for (int ch = 0; ch < jmin (2, numInputChannels); ++ch)
            if (inputChannelData[ch] != nullptr)
                scratch.copyFrom (ch, 0, inputChannelData[ch], numSamples);
    }

    // Aux send buses accumulate post-fader taps; cleared every block so a missed
    // try-lock yields silence (not stale audio) at the returns.
    for (int i = 0; i < numSends; ++i)
    {
        sendBuses[(size_t) i].setSize (2, numSamples, false, false, true);
        sendBuses[(size_t) i].clear();
    }

    // 1b) Parameter automation: evaluate every enabled envelope at the current
    //     (block-start) playhead and write it to the same atomics the manual
    //     setters use, so this block's gains/pans/sends ride the curve. The
    //     playhead is advanced at the end of the callback, so reading it here is
    //     the block-start position. Lock-free on contention (manual vals persist).
    automation.apply (playheadBeats.load());

    // 2) Sum the multitrack mixer. Each track renders into its group's buffer (or
    //    straight to the master scratch when ungrouped) and taps the send buses;
    //    each group then applies its own gain/pan, meters, and sums into the
    //    master; finally the returns sum back in. Try-lock so loads never block
    //    audio. Muted / soloed-out tracks still advance to stay in sync.
    {
        const ScopedTryLock stl (tracksLock);
        if (stl.isLocked())
        {
            for (auto* g : groups)
                g->clearBuffer (numSamples);

            const bool trackSoloing = anySolo.load() > 0;
            const bool groupSoloing = anyGroupSolo.load() > 0;

            // Block-start playhead drives which clip(s) each track plays this block.
            const double blockBeats = playheadBeats.load();
            const double bpmNow = tempo.load();
            const bool playingNow = playing.load();

            for (auto* t : tracks)
            {
                auto* g = t->group.load();
                const bool trackOK = ! t->mute.load() && (! trackSoloing || t->solo.load());
                const bool groupOK = (g == nullptr) ? (! groupSoloing)
                                                    : (! g->mute.load() && (! groupSoloing || g->solo.load()));
                AudioBuffer<float>& dest = (g != nullptr) ? g->getBuffer() : scratch;
                t->renderInto (dest, sendBuses.data(), numSends, numSamples, trackOK && groupOK,
                               blockBeats, bpmNow, playingNow);
            }

            for (auto* g : groups)
                g->sumInto (scratch, numSamples);

            // Returns: run the return's insert FX, apply its gain, meter, and sum
            // into the master.
            for (int i = 0; i < numSends; ++i)
            {
                auto& rb = sendBuses[(size_t) i];
                midi.clear();
                returnRacks[(size_t) i].process (rb, midi);
                rb.applyGain (returnGain[(size_t) i].load());

                float rpeak = 0.0f;
                for (int ch = 0; ch < rb.getNumChannels(); ++ch)
                    rpeak = jmax (rpeak, rb.getMagnitude (ch, 0, numSamples));
                returnLevel[(size_t) i].store (jmax (rpeak, returnLevel[(size_t) i].load() * 0.88f));

                for (int ch = 0; ch < scratch.getNumChannels(); ++ch)
                    scratch.addFrom (ch, 0, rb, jmin (ch, rb.getNumChannels() - 1), 0, numSamples);
            }
        }
    }

    // 3) Run the master FX chain in series (try-lock so loads never block audio).
    {
        const ScopedTryLock stl (chainLock);
        if (stl.isLocked())
        {
            midi.clear();
            for (int i = 0; i < numSlots; ++i)
                if (auto* inst = chain[(size_t) i].get())
                    if (! bypassed[(size_t) i].load())
                        inst->processBlock (scratch, midi);
        }
    }

    // 4) Master volume.
    scratch.applyGain (masterVolume.load());

    // 4b) Master pan (stereo balance; unity at center).
    if (const float mpan = masterPan.load(); scratch.getNumChannels() >= 2 && ! approximatelyEqual (mpan, 0.5f))
    {
        scratch.applyGain (0, 0, numSamples, mpan <= 0.5f ? 1.0f : (1.0f - mpan) * 2.0f);
        scratch.applyGain (1, 0, numSamples, mpan >= 0.5f ? 1.0f : mpan * 2.0f);
    }

    // 5) Meter (decaying peak).
    float peak = 0.0f;
    for (int ch = 0; ch < scratch.getNumChannels(); ++ch)
        peak = jmax (peak, scratch.getMagnitude (ch, 0, numSamples));
    masterLevel.store (jmax (peak, masterLevel.load() * 0.88f));

    // 6) Write to the output device.
    for (int ch = 0; ch < numOutputChannels; ++ch)
        if (outputChannelData[ch] != nullptr)
            FloatVectorOperations::copy (outputChannelData[ch],
                                         scratch.getReadPointer (jmin (ch, 1)), numSamples);

    // 7) Advance the beat clock, wrapping within the loop region when looping.
    if (playing.load())
    {
        const double bpm = tempo.load();
        double beats = playheadBeats.load() + (double) numSamples / currentSampleRate * (bpm / 60.0);

        const double loS = loopStartBeats.load();
        const double loE = loopEndBeats.load();
        bool wrapped = false;

        if (looping.load() && loE > loS)
        {
            if (beats >= loE) { beats = loS + std::fmod (beats - loS, loE - loS); wrapped = true; }
        }
        else
        {
            while (beats >= totalBeats) { beats -= totalBeats; wrapped = true; }
        }
        playheadBeats.store (beats);

        // On a wrap, drop clips out of their playing state so the next block
        // re-enters them at the new (looped) playhead — no drift.
        if (wrapped)
        {
            const ScopedTryLock stl (tracksLock);
            if (stl.isLocked())
                for (auto* t : tracks)
                    t->resyncClips();
            if (inputMode == "file" && fileLoaded.load())
                transportSource.setPosition (beatsToSeconds (beats));
        }
    }
}
