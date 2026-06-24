#include "TrackChannel.h"

using namespace juce;

TrackChannel::TrackChannel (String trackId) : id (std::move (trackId)) {}

TrackChannel::~TrackChannel()
{
    for (auto& cp : clips)
        cp->transport.setSource (nullptr);
    clips.clear();
}

int TrackChannel::setClips (AudioFormatManager& formatManager,
                            TimeSliceThread& readThread,
                            const std::vector<ClipSpec>& specs)
{
    // Tear down the old players, then build the new set. Callers hold tracksLock.
    for (auto& cp : clips)
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
    for (auto& cp : clips)
        cp->transport.setSource (nullptr);
    clips.clear();
}

void TrackChannel::prepare (double sampleRate, int blockSize)
{
    preparedSampleRate = sampleRate;
    preparedBlockSize  = blockSize;
    trackScratch.setSize (2, blockSize, false, false, true);
    clipScratch.setSize  (2, blockSize, false, false, true);
    for (auto& cp : clips)
        cp->transport.prepareToPlay (blockSize, sampleRate);
    inserts.prepare (sampleRate, blockSize);
}

void TrackChannel::releaseResources()
{
    for (auto& cp : clips)
        cp->transport.releaseResources();
    inserts.release();
}

void TrackChannel::resyncClips()
{
    for (auto& cp : clips)
    {
        cp->transport.stop();
        cp->active = false;
    }
}

void TrackChannel::renderInto (AudioBuffer<float>& bus,
                               AudioBuffer<float>* sendBuses, int numSendBuses,
                               int numSamples, bool audible,
                               double blockStartBeats, double bpm, bool playing)
{
    if (clips.empty())
    {
        decayMeter();
        return;
    }

    trackScratch.setSize (2, numSamples, false, false, true);
    trackScratch.clear();
    clipScratch.setSize (2, numSamples, false, false, true);

    const double spb = 60.0 / jmax (1.0, bpm);
    bool anyActive = false;

    // Manage + pull every clip regardless of audibility so positions stay in
    // sync (a muted/soloed-out track still advances under the playhead).
    for (auto& cp : clips)
    {
        const bool inRegion = playing
            && blockStartBeats >= cp->startBeat
            && blockStartBeats < cp->startBeat + cp->lenBeats;

        if (inRegion && ! cp->active)
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

        if (cp->active)
        {
            clipScratch.clear();
            AudioSourceChannelInfo info (&clipScratch, 0, numSamples);
            cp->transport.getNextAudioBlock (info); // advances; silent past end
            const int srcCh = clipScratch.getNumChannels();
            for (int ch = 0; ch < trackScratch.getNumChannels(); ++ch)
                trackScratch.addFrom (ch, 0, clipScratch, jmin (ch, srcCh - 1), 0, numSamples, cp->gain);
            anyActive = true;
        }
    }

    if (! audible || ! anyActive)
    {
        decayMeter();
        return;
    }

    // Pre-fader insert FX.
    rackMidi.clear();
    inserts.process (trackScratch, rackMidi);

    trackScratch.applyGain (gain.load());

    // Stereo balance: unity at center, attenuate the opposite side toward an edge.
    if (const float p = pan.load(); trackScratch.getNumChannels() >= 2 && ! approximatelyEqual (p, 0.5f))
    {
        trackScratch.applyGain (0, 0, numSamples, p <= 0.5f ? 1.0f : (1.0f - p) * 2.0f);
        trackScratch.applyGain (1, 0, numSamples, p >= 0.5f ? 1.0f : p * 2.0f);
    }

    const int busCh = bus.getNumChannels();
    const int srcCh = trackScratch.getNumChannels();
    for (int ch = 0; ch < busCh; ++ch)
        bus.addFrom (ch, 0, trackScratch, jmin (ch, srcCh - 1), 0, numSamples);

    // Post-fader aux sends: add a scaled copy of this (gain+pan) block to each bus.
    const int ns = jmin (numSendBuses, (int) sends.size());
    for (int i = 0; i < ns; ++i)
    {
        const float amt = sends[(size_t) i].load();
        if (amt > 0.0001f)
        {
            auto& sb = sendBuses[i];
            const int sbCh = sb.getNumChannels();
            for (int ch = 0; ch < sbCh; ++ch)
                sb.addFrom (ch, 0, trackScratch, jmin (ch, srcCh - 1), 0, numSamples, amt);
        }
    }

    float peak = 0.0f;
    for (int ch = 0; ch < srcCh; ++ch)
        peak = jmax (peak, trackScratch.getMagnitude (ch, 0, numSamples));
    level.store (jmax (peak, level.load() * 0.88f));
}
