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
        for (auto& p : chain)
            if (p != nullptr)
                p->releaseResources();
    }

    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
        {
            t->stop();
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

    const ScopedLock sl (tracksLock);
    const double secs = beatsToSeconds (playheadBeats.load());
    for (auto* t : tracks)
    {
        if (shouldPlay)
        {
            t->setPositionSeconds (secs);
            t->start();
        }
        else
        {
            t->stop();
        }
    }
}

void AudioEngine::stop()
{
    playing.store (false);
    transportSource.stop();
    transportSource.setPosition (0.0);
    playheadBeats.store (0.0);

    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
    {
        t->stop();
        t->setPositionSeconds (0.0);
    }
}

void AudioEngine::setPosition (double beats)
{
    const double b = jlimit (0.0, totalBeats, beats);
    playheadBeats.store (b);

    const double secs = beatsToSeconds (b);
    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
        t->setPositionSeconds (secs);
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
var AudioEngine::getDevicesInfo()
{
    auto* obj = new DynamicObject();

    AudioDeviceManager::AudioDeviceSetup setup;
    deviceManager.getAudioDeviceSetup (setup);
    obj->setProperty ("outputDevice", setup.outputDeviceName);
    obj->setProperty ("inputDevice", setup.inputDeviceName);
    obj->setProperty ("sampleRate", setup.sampleRate);
    obj->setProperty ("bufferSize", setup.bufferSize);

    Array<var> rates, sizes, outputs;
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
    return var (obj);
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
    for (auto* t : tracks)
        if (t->solo.load())
            ++count;
    anySolo.store (count);
}

void AudioEngine::setTrackGain (const String& id, float gainLinear) { ensureTrack (id).gain.store (jlimit (0.0f, 4.0f, gainLinear)); }
void AudioEngine::setTrackPan  (const String& id, float pan)        { ensureTrack (id).pan.store (jlimit (0.0f, 1.0f, pan)); }
void AudioEngine::setTrackMute (const String& id, bool muted)       { ensureTrack (id).mute.store (muted); }
void AudioEngine::setTrackSolo (const String& id, bool soloed)      { ensureTrack (id).solo.store (soloed); recomputeAnySolo(); }
void AudioEngine::setTrackArm  (const String& id, bool armed)       { ensureTrack (id).arm.store (armed); }

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
    for (auto* g : groups)
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

var AudioEngine::buildGroupLevels()
{
    auto* obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (auto* g : groups)
            obj->setProperty (Identifier (g->getId()), (double) g->level.load());
    return var (obj);
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
    const auto f32 = [&t] (std::atomic<float>* p, float lo, float hi) -> AutomationStore::Target
    {
        t.kind = AutomationStore::Kind::f32;
        t.f32 = p;
        t.lo = lo;
        t.hi = hi;
        return t;
    };

    if (nodeId == "master")
    {
        if (paramId == "mvol") return f32 (&masterVolume, 0.0f, 2.0f);
        if (paramId == "mpan") return f32 (&masterPan,    0.0f, 1.0f);
        return t;
    }
    if (nodeId.startsWith ("return-"))
    {
        const int i = nodeId.fromFirstOccurrenceOf ("return-", false, false).getIntValue();
        if (paramId == "rgain" && isPositiveAndBelow (i, numSends))
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
    auto* obj = new DynamicObject();
    const ScopedLock sl (tracksLock);

    auto addRack = [obj] (const String& nodeId, DeviceRack& r)
    {
        Array<var> slots;
        for (int s = 0; s < DeviceRack::numSlots; ++s)
            if (r.has (s))
            {
                auto* o = new DynamicObject();
                o->setProperty ("key", PluginHost::slotKey (s));
                o->setProperty ("name", r.get (s)->getName());
                o->setProperty ("bypassed", r.isBypassed (s));
                slots.add (var (o));
            }
        if (! slots.isEmpty())
            obj->setProperty (Identifier (nodeId), var (slots));
    };

    for (auto* t : tracks) addRack (t->getId(), t->inserts);
    for (auto* g : groups) addRack (g->getId(), g->inserts);
    for (int i = 0; i < numSends; ++i) addRack ("return-" + String (i), returnRacks[(size_t) i]);
    return var (obj);
}

var AudioEngine::buildNodeRackStates()
{
    auto* obj = new DynamicObject();
    const ScopedLock sl (tracksLock);

    auto addRack = [obj] (const String& nodeId, DeviceRack& r)
    {
        auto* no = new DynamicObject();
        bool any = false;
        for (int s = 0; s < DeviceRack::numSlots; ++s)
            if (r.has (s)) { no->setProperty (PluginHost::slotKey (s), r.getState (s)); any = true; }
        if (any)
            obj->setProperty (Identifier (nodeId), var (no));
    };

    for (auto* t : tracks) addRack (t->getId(), t->inserts);
    for (auto* g : groups) addRack (g->getId(), g->inserts);
    for (int i = 0; i < numSends; ++i) addRack ("return-" + String (i), returnRacks[(size_t) i]);
    return var (obj);
}

bool AudioEngine::assignTrackFile (const String& id, const File& file)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock); // serialize the source swap against the audio thread
    const bool ok = ch.loadFile (audioFormatManager, readThread, file);
    if (ok && playing.load())
    {
        ch.setPositionSeconds (beatsToSeconds (playheadBeats.load()));
        ch.start();
    }
    return ok;
}

void AudioEngine::clearTrackFile (const String& id)
{
    const ScopedLock sl (tracksLock);
    if (auto* t = trackById[id])
        t->clearFile();
}

var AudioEngine::buildTrackLevels()
{
    auto* obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (auto* t : tracks)
            obj->setProperty (Identifier (t->getId()), (double) t->level.load());
    return var (obj);
}

var AudioEngine::buildTrackInfo()
{
    auto* obj = new DynamicObject();
    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
    {
        auto* s = new DynamicObject();
        s->setProperty ("loaded", t->hasFile());
        s->setProperty ("name", t->getFileName());
        s->setProperty ("path", t->getFilePath());
        obj->setProperty (Identifier (t->getId()), var (s));
    }
    return var (obj);
}

// ---- plugin chain ----
AudioPluginInstance* AudioEngine::getInstance (int slot) const
{
    if (slot < 0 || slot >= numSlots) return nullptr;
    return chain[(size_t) slot].get();
}

void AudioEngine::prepareSlot (int slot)
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
    auto* inst = getInstance (slot);
    return inst != nullptr ? inst->getName() : String();
}

void AudioEngine::setBypassed (int slot, bool b)
{
    if (slot >= 0 && slot < numSlots)
        bypassed[(size_t) slot].store (b);
}

void AudioEngine::setParam (int slot, const String& paramId, float value01)
{
    auto* inst = getInstance (slot);
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

var AudioEngine::listParams (int slot)
{
    Array<var> out;
    if (auto* inst = getInstance (slot))
    {
        const auto& params = inst->getParameters();
        for (int i = 0; i < params.size(); ++i)
        {
            auto* obj = new DynamicObject();
            obj->setProperty ("id", String (i));
            obj->setProperty ("name", params[i]->getName (64));
            obj->setProperty ("value", params[i]->getValue());
            obj->setProperty ("text", params[i]->getText (params[i]->getValue(), 0));
            out.add (var (obj));
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

bool AudioEngine::setPluginState (int slot, const String& base64)
{
    auto* inst = getInstance (slot);
    if (inst == nullptr || base64.isEmpty())
        return false;

    juce::MemoryBlock mb;
    if (! mb.fromBase64Encoding (base64) || mb.getSize() == 0)
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
        for (auto& p : chain)
            if (p != nullptr)
                p->releaseResources();
    }
    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
            t->releaseResources();
        for (auto* g : groups)
            g->inserts.release();
    }
    for (auto& r : returnRacks)
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

            for (auto* t : tracks)
            {
                auto* g = t->group.load();
                const bool trackOK = ! t->mute.load() && (! trackSoloing || t->solo.load());
                const bool groupOK = (g == nullptr) ? (! groupSoloing)
                                                    : (! g->mute.load() && (! groupSoloing || g->solo.load()));
                AudioBuffer<float>& dest = (g != nullptr) ? g->getBuffer() : scratch;
                t->renderInto (dest, sendBuses.data(), numSends, numSamples, trackOK && groupOK);
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
    const float mpan = masterPan.load();
    if (scratch.getNumChannels() >= 2 && ! approximatelyEqual (mpan, 0.5f))
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

        // On a wrap, re-seek the sources so audio stays aligned to the loop.
        if (wrapped)
        {
            const double secs = beats * 60.0 / jmax (1.0, bpm);
            const ScopedTryLock stl (tracksLock);
            if (stl.isLocked())
                for (auto* t : tracks)
                    t->setPositionSeconds (secs);
            if (inputMode == "file" && fileLoaded.load())
                transportSource.setPosition (secs);
        }
    }
}
