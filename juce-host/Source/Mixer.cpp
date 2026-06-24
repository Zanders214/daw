#include "Mixer.h"

using namespace juce;

void Mixer::initialise() { readThread.startThread(); }

void Mixer::shutdown()
{
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
}

void Mixer::prepare (double sampleRateToUse, int blockSizeToUse)
{
    sampleRate = sampleRateToUse;
    blockSize  = blockSizeToUse;
    {
        const ScopedLock sl (tracksLock);
        for (auto* t : tracks)
            t->prepare (sampleRate, blockSize);
        for (auto* g : groups)
            g->prepare (sampleRate, blockSize);
    }
    for (auto& sb : sendBuses)
        sb.setSize (2, blockSize, false, false, true);
    for (auto& r : returnRacks)
        r.prepare (sampleRate, blockSize);
}

void Mixer::releaseResources()
{
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

void Mixer::resyncAllClips()
{
    const ScopedLock sl (tracksLock);
    for (auto* t : tracks)
        t->resyncClips();
}

void Mixer::resyncClipsAudioThread()
{
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (auto* t : tracks)
            t->resyncClips();
}

// ---- tracks ----
TrackChannel& Mixer::ensureTrack (const String& id)
{
    const ScopedLock sl (tracksLock);
    if (auto* existing = trackById[id])
        return *existing;

    auto* ch = tracks.add (new TrackChannel (id));
    trackById.set (id, ch);
    if (sampleRate > 0.0)
        ch->prepare (sampleRate, blockSize);
    return *ch;
}

void Mixer::recomputeAnySolo()
{
    const ScopedLock sl (tracksLock);
    int count = 0;
    for (const auto* t : tracks)
        if (t->solo.load())
            ++count;
    anySolo.store (count);
}

void Mixer::setTrackGain (const String& id, float gainLinear) { ensureTrack (id).gain.store (jlimit (0.0f, 4.0f, gainLinear)); }
void Mixer::setTrackPan  (const String& id, float pan)        { ensureTrack (id).pan.store (jlimit (0.0f, 1.0f, pan)); }
void Mixer::setTrackMute (const String& id, bool muted)       { ensureTrack (id).mute.store (muted); }
void Mixer::setTrackSolo (const String& id, bool soloed)      { ensureTrack (id).solo.store (soloed); recomputeAnySolo(); }
void Mixer::setTrackArm  (const String& id, bool armed)       { ensureTrack (id).arm.store (armed); }

void Mixer::createTrack (const String& id, const String& name, const String& type,
                         const String& color, const String& group)
{
    auto& t = ensureTrack (id);
    t.setMeta (name, type, color);
    t.group.store (group.isEmpty() ? nullptr : &ensureGroup (group));
}

void Mixer::destroyTrack (const String& id)
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

var Mixer::buildTrackList() const
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

// ---- groups ----
GroupBus& Mixer::ensureGroup (const String& id)
{
    const ScopedLock sl (tracksLock);
    if (auto* existing = groupById[id])
        return *existing;

    auto* g = groups.add (new GroupBus (id));
    groupById.set (id, g);
    if (sampleRate > 0.0)
        g->prepare (sampleRate, blockSize);
    return *g;
}

void Mixer::recomputeAnyGroupSolo()
{
    const ScopedLock sl (tracksLock);
    int count = 0;
    for (const auto* g : groups)
        if (g->solo.load())
            ++count;
    anyGroupSolo.store (count);
}

void Mixer::setTrackGroup (const String& trackId, const String& groupId)
{
    auto& t = ensureTrack (trackId);
    t.group.store (groupId.isEmpty() ? nullptr : &ensureGroup (groupId));
}

void Mixer::setGroupGain (const String& groupId, float gainLinear) { ensureGroup (groupId).gain.store (jlimit (0.0f, 4.0f, gainLinear)); }
void Mixer::setGroupPan  (const String& groupId, float pan)        { ensureGroup (groupId).pan.store (jlimit (0.0f, 1.0f, pan)); }
void Mixer::setGroupMute (const String& groupId, bool muted)       { ensureGroup (groupId).mute.store (muted); }
void Mixer::setGroupSolo (const String& groupId, bool soloed)      { ensureGroup (groupId).solo.store (soloed); recomputeAnyGroupSolo(); }

var Mixer::buildGroupLevels() const
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (const auto* g : groups)
            obj->setProperty (Identifier (g->getId()), (double) g->level.load());
    return var (obj.get());
}

// ---- sends / returns ----
void Mixer::setTrackSend (const String& trackId, int sendIdx, float amount)
{
    if (isPositiveAndBelow (sendIdx, numSends))
        ensureTrack (trackId).sends[(size_t) sendIdx].store (jlimit (0.0f, 1.0f, amount));
}

void Mixer::setReturnGain (int sendIdx, float gainLinear)
{
    if (isPositiveAndBelow (sendIdx, numSends))
        returnGain[(size_t) sendIdx].store (jlimit (0.0f, 4.0f, gainLinear));
}

var Mixer::buildReturnLevels()
{
    Array<var> out;
    for (int i = 0; i < numSends; ++i)
        out.add ((double) returnLevel[(size_t) i].load());
    return out;
}

// ---- automation ----
void Mixer::setAutomation (const String& nodeId, const String& paramId,
                           std::vector<AutomationStore::Point> points)
{
    automation.set (nodeId + "|" + paramId, std::move (points), resolveAutoTarget (nodeId, paramId));
}

void Mixer::clearAutomation (const String& nodeId, const String& paramId)
{
    automation.clear (nodeId + "|" + paramId);
}

void Mixer::clearAllAutomation() { automation.clearAll(); }

AutomationStore::Target Mixer::resolveAutoTarget (const String& nodeId, const String& paramId)
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
        if (paramId == "mvol") return f32 (masterBus.volumeParam(), 0.0f, 2.0f);
        if (paramId == "mpan") return f32 (masterBus.panParam(),    0.0f, 1.0f);
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

// ---- node racks ----
DeviceRack* Mixer::rackForNode (const String& nodeId)
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

DeviceRack* Mixer::ensureNodeRack (const String& nodeId)
{
    if (nodeId.startsWith ("return-"))
        return rackForNode (nodeId);
    // Group ids are "g-..." in the UI seed; everything else is a track id.
    if (nodeId.startsWith ("g-"))
        return &ensureGroup (nodeId).inserts;
    return &ensureTrack (nodeId).inserts;
}

var Mixer::buildNodeRacks()
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

var Mixer::buildNodeRackStates()
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

// ---- per-track source ----
bool Mixer::assignTrackFile (const String& id, const File& file)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock); // serialize the source swap against the audio thread
    // The next audio block enters the (full-span) clip at the current playhead.
    return ch.loadFile (audioFormatManager, readThread, file);
}

void Mixer::setTrackClips (const String& id, const std::vector<TrackChannel::ClipSpec>& clips)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock);
    ch.setClips (audioFormatManager, readThread, clips);
}

void Mixer::setTrackMidiNotes (const String& id, std::vector<TrackChannel::MidiNoteSpec> notes)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock);
    ch.setMidiNotes (std::move (notes));
}

void Mixer::clearTrackFile (const String& id) const
{
    const ScopedLock sl (tracksLock);
    if (auto* t = trackById[id])
        t->clearFile();
}

var Mixer::buildTrackLevels() const
{
    DynamicObject::Ptr obj = new DynamicObject();
    const ScopedTryLock stl (tracksLock);
    if (stl.isLocked())
        for (const auto* t : tracks)
            obj->setProperty (Identifier (t->getId()), (double) t->level.load());
    return var (obj.get());
}

var Mixer::buildTrackInfo() const
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

// ---- audio thread ----
void Mixer::mixInto (AudioBuffer<float>& master, int numSamples,
                     double blockBeats, double bpm, bool playing)
{
    // Aux send buses accumulate post-fader taps; cleared every block so a missed
    // try-lock yields silence (not stale audio) at the returns.
    for (int i = 0; i < numSends; ++i)
    {
        sendBuses[(size_t) i].setSize (2, numSamples, false, false, true);
        sendBuses[(size_t) i].clear();
    }

    // Try-lock so loads never block audio. Muted / soloed-out tracks still
    // advance to stay in sync.
    const ScopedTryLock stl (tracksLock);
    if (! stl.isLocked())
        return;

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
        AudioBuffer<float>& dest = (g != nullptr) ? g->getBuffer() : master;
        t->renderInto (dest, sendBuses.data(), numSends, numSamples, trackOK && groupOK,
                       blockBeats, bpm, playing);
    }

    for (auto* g : groups)
        g->sumInto (master, numSamples);

    // Returns: run the return's insert FX, apply its gain, meter, and sum
    // into the master.
    for (int i = 0; i < numSends; ++i)
    {
        auto& rb = sendBuses[(size_t) i];
        returnMidi.clear();
        returnRacks[(size_t) i].process (rb, returnMidi);
        rb.applyGain (returnGain[(size_t) i].load());

        float rpeak = 0.0f;
        for (int ch = 0; ch < rb.getNumChannels(); ++ch)
            rpeak = jmax (rpeak, rb.getMagnitude (ch, 0, numSamples));
        returnLevel[(size_t) i].store (jmax (rpeak, returnLevel[(size_t) i].load() * 0.88f));

        for (int ch = 0; ch < master.getNumChannels(); ++ch)
            master.addFrom (ch, 0, rb, jmin (ch, rb.getNumChannels() - 1), 0, numSamples);
    }
}
