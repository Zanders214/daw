#include "AudioEngine.h"

using namespace juce;

namespace
{
    /** A window that hosts a plugin's editor and notifies on close. */
    class PluginEditorWindow : public DocumentWindow
    {
    public:
        PluginEditorWindow (const String& name)
            : DocumentWindow (name, Colours::black, DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar (true);
        }

        std::function<void()> onCloseCallback;
        void closeButtonPressed() override { if (onCloseCallback) onCloseCallback(); }
    };
}

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
void AudioEngine::setPlaying (bool shouldPlay)
{
    playing.store (shouldPlay);
    if (inputMode == "file")
    {
        if (shouldPlay) transportSource.start();
        else            transportSource.stop();
    }
}

void AudioEngine::stop()
{
    playing.store (false);
    transportSource.stop();
    transportSource.setPosition (0.0);
    playheadBeats.store (0.0);
}

void AudioEngine::setPosition (double beats)
{
    playheadBeats.store (jlimit (0.0, totalBeats, beats));
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
void AudioEngine::setTrackMute (const String& id, bool muted)       { ensureTrack (id).mute.store (muted); }
void AudioEngine::setTrackSolo (const String& id, bool soloed)      { ensureTrack (id).solo.store (soloed); recomputeAnySolo(); }
void AudioEngine::setTrackArm  (const String& id, bool armed)       { ensureTrack (id).arm.store (armed); }

bool AudioEngine::assignTrackFile (const String& id, const File& file)
{
    auto& ch = ensureTrack (id);
    const ScopedLock sl (tracksLock); // serialize the source swap against the audio thread
    return ch.loadFile (audioFormatManager, readThread, file);
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
    }
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
    }
}

void AudioEngine::audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                                    int numInputChannels,
                                                    float* const* outputChannelData,
                                                    int numOutputChannels,
                                                    int numSamples,
                                                    const AudioIODeviceCallbackContext&)
{
    scratch.setSize (2, numSamples, false, false, true);
    scratch.clear();

    // 1) Fill the working buffer from the source.
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

    // 2) Run the FX chain in series (try-lock so loads never block audio).
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

    // 3) Meter (decaying peak).
    float peak = 0.0f;
    for (int ch = 0; ch < scratch.getNumChannels(); ++ch)
        peak = jmax (peak, scratch.getMagnitude (ch, 0, numSamples));
    masterLevel.store (jmax (peak, masterLevel.load() * 0.88f));

    // 4) Write to the output device.
    for (int ch = 0; ch < numOutputChannels; ++ch)
        if (outputChannelData[ch] != nullptr)
            FloatVectorOperations::copy (outputChannelData[ch],
                                         scratch.getReadPointer (jmin (ch, 1)), numSamples);

    // 5) Advance the beat clock.
    if (playing.load())
    {
        double beats = playheadBeats.load()
                     + (double) numSamples / currentSampleRate * (tempo.load() / 60.0);
        while (beats >= totalBeats)
            beats -= totalBeats;
        playheadBeats.store (beats);
    }
}
