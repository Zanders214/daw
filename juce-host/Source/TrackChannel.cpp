#include "TrackChannel.h"

using namespace juce;

TrackChannel::TrackChannel (String trackId) : id (std::move (trackId)) {}

TrackChannel::~TrackChannel()
{
    for (const auto& cp : clips)
        cp->transport.setSource (nullptr);
    clips.clear();
}

int TrackChannel::setClips (AudioFormatManager& formatManager,
                            TimeSliceThread& readThread,
                            const std::vector<ClipSpec>& specs)
{
    // Tear down the old players, then build the new set. Callers hold tracksLock.
    for (const auto& cp : clips)
        cp->transport.setSource (nullptr);
    clips.clear();

    int loaded = 0;
    for (const auto& spec : specs)
    {
        auto* reader = formatManager.createReaderFor (File (spec.filePath));
        if (reader == nullptr)
            continue;

        auto cp = std::make_unique<ClipPlayer>();
        cp->clipId    = spec.clipId;
        cp->filePath  = spec.filePath;
        cp->startBeat = spec.startBeat;
        cp->lenBeats  = spec.lenBeats;
        cp->offsetSec = spec.offsetSec;
        cp->gain      = spec.gain;
        cp->reader    = std::make_unique<AudioFormatReaderSource> (reader, true);
        // 32k read-ahead on the shared thread; source rate passed for correction.
        cp->transport.setSource (cp->reader.get(), 32768, &readThread, reader->sampleRate, 2);
        if (preparedSampleRate > 0.0)
            cp->transport.prepareToPlay (preparedBlockSize, preparedSampleRate);

        clips.push_back (std::move (cp));
        ++loaded;
    }
    return loaded;
}

void TrackChannel::setMidiNotes (std::vector<MidiNoteSpec> notes)
{
    // Callers hold tracksLock. The audio thread reads `midiNotes` each block.
    midiNotes = std::move (notes);
}

bool TrackChannel::loadFile (AudioFormatManager& formatManager,
                             TimeSliceThread& readThread,
                             const File& file)
{
    // Back-compat: a track-level file is one clip spanning the whole timeline.
    ClipSpec spec;
    spec.filePath = file.getFullPathName();
    spec.startBeat = 0.0;
    spec.lenBeats = 1.0e9; // effectively "the whole song"
    return setClips (formatManager, readThread, { spec }) > 0;
}

void TrackChannel::clearFile()
{
    for (const auto& cp : clips)
        cp->transport.setSource (nullptr);
    clips.clear();
}

void TrackChannel::prepare (double sampleRate, int blockSize)
{
    preparedSampleRate = sampleRate;
    preparedBlockSize  = blockSize;
    scratch.trackScratch.setSize (2, blockSize, false, false, true);
    scratch.clipScratch.setSize  (2, blockSize, false, false, true);
    for (const auto& cp : clips)
        cp->transport.prepareToPlay (blockSize, sampleRate);
    synth.prepare (sampleRate);
    inserts.prepare (sampleRate, blockSize);
}

void TrackChannel::releaseResources() const
{
    for (const auto& cp : clips)
        cp->transport.releaseResources();
    inserts.release();
}

void TrackChannel::resyncClips()
{
    for (const auto& cp : clips)
    {
        cp->transport.stop();
        cp->active = false;
    }
    synth.panic(); // kill any sounding MIDI voices so a seek/loop/pause doesn't hang
}

bool TrackChannel::mixClips (int numSamples, double blockStartBeats, double spb, bool playing)
{
    bool anyActive = false;

    // Manage + pull every clip regardless of audibility so positions stay in
    // sync (a muted/soloed-out track still advances under the playhead).
    for (const auto& cp : clips)
    {
        if (const bool inRegion = playing
                && blockStartBeats >= cp->startBeat
                && blockStartBeats < cp->startBeat + cp->lenBeats;
            inRegion && ! cp->active)
        {
            cp->transport.setPosition (jmax (0.0, cp->offsetSec + (blockStartBeats - cp->startBeat) * spb));
            cp->transport.start();
            cp->active = true;
        }
        else if (! inRegion && cp->active)
        {
            cp->transport.stop();
            cp->active = false;
        }

        if (! cp->active)
            continue;

        scratch.clipScratch.clear();
        AudioSourceChannelInfo info (&scratch.clipScratch, 0, numSamples);
        cp->transport.getNextAudioBlock (info); // advances; silent past end
        const int srcCh = scratch.clipScratch.getNumChannels();
        for (int ch = 0; ch < scratch.trackScratch.getNumChannels(); ++ch)
            scratch.trackScratch.addFrom (ch, 0, scratch.clipScratch, jmin (ch, srcCh - 1), 0, numSamples, cp->gain);
        anyActive = true;
    }

    return anyActive;
}

void TrackChannel::renderMidi (int numSamples, double blockStartBeats, double spb, bool playing)
{
    // MIDI: schedule this block's note-on/off into the built-in synth and render
    // it (adds on top of the clip audio). Done regardless of audibility so voices
    // advance in sync; the audibility gate in renderInto discards the result if needed.
    scratch.synthMidi.clear();
    if (playing && preparedSampleRate > 0.0)
    {
        const double blockEndBeats = blockStartBeats + (numSamples / preparedSampleRate) / spb;
        const auto sampleAt = [&] (double beat)
        {
            return (int) jlimit (0.0, (double) (numSamples - 1),
                                 (beat - blockStartBeats) * spb * preparedSampleRate);
        };
        for (const auto& note : midiNotes)
        {
            if (note.absBeat >= blockStartBeats && note.absBeat < blockEndBeats)
                scratch.synthMidi.addEvent (MidiMessage::noteOn (1, note.pitch, note.velocity), sampleAt (note.absBeat));
            if (const double offBeat = note.absBeat + note.durBeat;
                offBeat >= blockStartBeats && offBeat < blockEndBeats)
                scratch.synthMidi.addEvent (MidiMessage::noteOff (1, note.pitch), sampleAt (offBeat));
        }
    }
    synth.renderInto (scratch.trackScratch, scratch.synthMidi, numSamples);
}

void TrackChannel::applyPan (int numSamples)
{
    // Stereo balance: unity at center, attenuate the opposite side toward an edge.
    if (const float p = pan.load(); scratch.trackScratch.getNumChannels() >= 2 && ! approximatelyEqual (p, 0.5f))
    {
        scratch.trackScratch.applyGain (0, 0, numSamples, p <= 0.5f ? 1.0f : (1.0f - p) * 2.0f);
        scratch.trackScratch.applyGain (1, 0, numSamples, p >= 0.5f ? 1.0f : p * 2.0f);
    }
}

void TrackChannel::mixToSends (AudioBuffer<float>* sendBuses, int numSendBuses, int numSamples, int srcCh)
{
    // Post-fader aux sends: add a scaled copy of this (gain+pan) block to each bus.
    const int ns = jmin (numSendBuses, (int) sends.size());
    for (int i = 0; i < ns; ++i)
    {
        const float amt = sends[(size_t) i].load();
        if (amt <= 0.0001f)
            continue;

        auto& sb = sendBuses[i];
        const int sbCh = sb.getNumChannels();
        for (int ch = 0; ch < sbCh; ++ch)
            sb.addFrom (ch, 0, scratch.trackScratch, jmin (ch, srcCh - 1), 0, numSamples, amt);
    }
}

void TrackChannel::updateMeter (int numSamples, int srcCh)
{
    float peak = 0.0f;
    for (int ch = 0; ch < srcCh; ++ch)
        peak = jmax (peak, scratch.trackScratch.getMagnitude (ch, 0, numSamples));
    level.store (jmax (peak, level.load() * 0.88f));
}

void TrackChannel::renderInto (AudioBuffer<float>& bus,
                               AudioBuffer<float>* sendBuses, int numSendBuses,
                               int numSamples, bool audible,
                               double blockStartBeats, double bpm, bool playing)
{
    if (clips.empty() && midiNotes.empty())
    {
        decayMeter();
        return;
    }

    scratch.trackScratch.setSize (2, numSamples, false, false, true);
    scratch.trackScratch.clear();
    scratch.clipScratch.setSize (2, numSamples, false, false, true);

    const double spb = 60.0 / jmax (1.0, bpm);
    const bool anyActive = mixClips (numSamples, blockStartBeats, spb, playing);

    const bool hasMidi = ! midiNotes.empty();
    if (hasMidi)
        renderMidi (numSamples, blockStartBeats, spb, playing);

    if (! audible || (! anyActive && ! hasMidi))
    {
        decayMeter();
        return;
    }

    // Pre-fader insert FX.
    scratch.rackMidi.clear();
    inserts.process (scratch.trackScratch, scratch.rackMidi);

    scratch.trackScratch.applyGain (gain.load());
    applyPan (numSamples);

    const int busCh = bus.getNumChannels();
    const int srcCh = scratch.trackScratch.getNumChannels();
    for (int ch = 0; ch < busCh; ++ch)
        bus.addFrom (ch, 0, scratch.trackScratch, jmin (ch, srcCh - 1), 0, numSamples);

    mixToSends (sendBuses, numSendBuses, numSamples, srcCh);
    updateMeter (numSamples, srcCh);
}
