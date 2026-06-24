#include "AudioEngine.h"

using namespace juce;

AudioEngine::AudioEngine()
{
    source.audioFormatManager.registerBasicFormats();
}

AudioEngine::~AudioEngine()
{
    shutdown();
}

void AudioEngine::initialise()
{
    mix.initialise();
    deviceManager.initialiseWithDefaultDevices (2, 2);
    deviceManager.addAudioCallback (this);
}

void AudioEngine::shutdown()
{
    deviceManager.removeAudioCallback (this);
    master.closeAllEditors();
    master.releaseResources();
    mix.shutdown();

    source.transportSource.setSource (nullptr);
    source.readerSource.reset();
}

// ---- transport ----
double AudioEngine::beatsToSeconds (double beats) const
{
    return beats * 60.0 / jmax (1.0, transport.tempo.load());
}

void AudioEngine::setPlaying (bool shouldPlay)
{
    transport.playing.store (shouldPlay);
    if (source.inputMode == "file")
    {
        if (shouldPlay) source.transportSource.start();
        else            source.transportSource.stop();
    }

    // Drop clips out of their playing state; the audio callback re-enters each one
    // at the right offset on the next block (handles both play and pause).
    mix.resyncAllClips();
}

void AudioEngine::stop()
{
    transport.playing.store (false);
    source.transportSource.stop();
    source.transportSource.setPosition (0.0);
    transport.playheadBeats.store (0.0);
    mix.resyncAllClips();
}

void AudioEngine::setPosition (double beats)
{
    const double b = jlimit (0.0, totalBeats, beats);
    transport.playheadBeats.store (b);
    mix.resyncAllClips();
}

// ---- source ----
bool AudioEngine::loadAudioFile (const File& file)
{
    auto* reader = source.audioFormatManager.createReaderFor (file);
    if (reader == nullptr)
        return false;

    auto newSource = std::make_unique<AudioFormatReaderSource> (reader, true);
    source.transportSource.setSource (newSource.get(), 0, nullptr, reader->sampleRate);
    source.readerSource = std::move (newSource);
    source.fileLoaded.store (true);
    return true;
}

void AudioEngine::setInputMode (const String& mode)
{
    source.inputMode = mode;
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
    transport.loopStartBeats.store (jlimit (0.0, totalBeats, startBeats));
    transport.loopEndBeats.store   (jlimit (0.0, totalBeats, endBeats));
}

// ---- audio callback ----
void AudioEngine::audioDeviceAboutToStart (AudioIODevice* device)
{
    currentSampleRate = device->getCurrentSampleRate();
    currentBlockSize  = device->getCurrentBufferSizeSamples();
    scratch.setSize (2, currentBlockSize, false, false, true);

    source.transportSource.prepareToPlay (currentBlockSize, currentSampleRate);
    master.prepare (currentSampleRate, currentBlockSize);
    mix.prepare (currentSampleRate, currentBlockSize);
}

void AudioEngine::audioDeviceStopped()
{
    source.transportSource.releaseResources();
    master.releaseResources();
    mix.releaseResources();
}

void AudioEngine::renderLegacySource (const float* const* inputChannelData,
                                      int numInputChannels, int numSamples)
{
    // Legacy single source (Phase 1 path: file player or input monitor).
    if (source.inputMode == "file" && source.fileLoaded.load())
    {
        AudioSourceChannelInfo info (&scratch, 0, numSamples);
        source.transportSource.getNextAudioBlock (info); // silent when stopped
    }
    else if (source.inputMode == "input")
    {
        for (int ch = 0; ch < jmin (2, numInputChannels); ++ch)
            if (inputChannelData[ch] != nullptr)
                scratch.copyFrom (ch, 0, inputChannelData[ch], numSamples);
    }
}

void AudioEngine::advanceTransport (int numSamples)
{
    // Advance the beat clock, wrapping within the loop region when looping.
    if (! transport.playing.load())
        return;

    const double bpm = transport.tempo.load();
    double beats = transport.playheadBeats.load() + (double) numSamples / currentSampleRate * (bpm / 60.0);

    const double loS = transport.loopStartBeats.load();
    const double loE = transport.loopEndBeats.load();
    bool wrapped = false;

    if (transport.looping.load() && loE > loS)
    {
        if (beats >= loE) { beats = loS + std::fmod (beats - loS, loE - loS); wrapped = true; }
    }
    else
    {
        while (beats >= totalBeats) { beats -= totalBeats; wrapped = true; }
    }
    transport.playheadBeats.store (beats);

    if (! wrapped)
        return;

    // On a wrap, drop clips out of their playing state so the next block
    // re-enters them at the new (looped) playhead — no drift.
    mix.resyncClipsAudioThread();
    if (source.inputMode == "file" && source.fileLoaded.load())
        source.transportSource.setPosition (beatsToSeconds (beats));
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
    renderLegacySource (inputChannelData, numInputChannels, numSamples);

    // 1b) Parameter automation: evaluate every enabled envelope at the current
    //     (block-start) playhead and write it to the same atomics the manual
    //     setters use, so this block's gains/pans/sends ride the curve.
    mix.applyAutomation (transport.playheadBeats.load());

    // 2) Sum the multitrack mixer (tracks -> groups -> returns) into scratch.
    mix.mixInto (scratch, numSamples, transport.playheadBeats.load(),
                 transport.tempo.load(), transport.playing.load());

    // 3) Run the master FX chain in series, then apply master volume + pan.
    master.process (scratch, midi);
    master.applyMasterGainAndPan (scratch, numSamples);

    // 5) Meter (decaying peak).
    float peak = 0.0f;
    for (int ch = 0; ch < scratch.getNumChannels(); ++ch)
        peak = jmax (peak, scratch.getMagnitude (ch, 0, numSamples));
    transport.masterLevel.store (jmax (peak, transport.masterLevel.load() * 0.88f));

    // 6) Write to the output device.
    for (int ch = 0; ch < numOutputChannels; ++ch)
        if (outputChannelData[ch] != nullptr)
            FloatVectorOperations::copy (outputChannelData[ch],
                                         scratch.getReadPointer (jmin (ch, 1)), numSamples);

    // 7) Advance the beat clock, wrapping within the loop region when looping.
    advanceTransport (numSamples);
}
