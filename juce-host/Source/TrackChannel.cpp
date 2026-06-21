#include "TrackChannel.h"

using namespace juce;

TrackChannel::TrackChannel (String trackId) : id (std::move (trackId)) {}

TrackChannel::~TrackChannel()
{
    transport.setSource (nullptr);
    readerSource.reset();
}

bool TrackChannel::loadFile (AudioFormatManager& formatManager,
                             TimeSliceThread& readThread,
                             const File& file)
{
    auto* reader = formatManager.createReaderFor (file);
    if (reader == nullptr)
        return false;

    auto newSource = std::make_unique<AudioFormatReaderSource> (reader, true);
    // 32k read-ahead on the shared thread keeps disk I/O off the audio thread;
    // the source sample rate is passed so playback is rate-corrected.
    transport.setSource (newSource.get(), 32768, &readThread, reader->sampleRate, 2);
    readerSource = std::move (newSource);
    filePath = file.getFullPathName();
    fileLoaded.store (true);

    if (preparedSampleRate > 0.0)
        transport.prepareToPlay (preparedBlockSize, preparedSampleRate);
    return true;
}

void TrackChannel::clearFile()
{
    transport.stop();
    transport.setSource (nullptr);
    readerSource.reset();
    fileLoaded.store (false);
    filePath = {};
}

void TrackChannel::prepare (double sampleRate, int blockSize)
{
    preparedSampleRate = sampleRate;
    preparedBlockSize  = blockSize;
    trackScratch.setSize (2, blockSize, false, false, true);
    transport.prepareToPlay (blockSize, sampleRate);
}

void TrackChannel::releaseResources()
{
    transport.releaseResources();
}

void TrackChannel::start()                            { transport.start(); }
void TrackChannel::stop()                             { transport.stop(); }
void TrackChannel::setPositionSeconds (double seconds){ transport.setPosition (seconds); }

void TrackChannel::renderInto (AudioBuffer<float>& bus,
                               AudioBuffer<float>* sendBuses, int numSendBuses,
                               int numSamples, bool audible)
{
    if (! fileLoaded.load())
    {
        decayMeter();
        return;
    }

    trackScratch.setSize (2, numSamples, false, false, true);
    trackScratch.clear();

    AudioSourceChannelInfo info (&trackScratch, 0, numSamples);
    transport.getNextAudioBlock (info); // advances the source; silent when stopped / past end

    if (! audible)
    {
        decayMeter();
        return;
    }

    trackScratch.applyGain (gain.load());

    // Stereo balance: unity at center, attenuate the opposite side toward an edge.
    const float p = pan.load();
    if (trackScratch.getNumChannels() >= 2 && ! approximatelyEqual (p, 0.5f))
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
            for (int ch = 0; ch < sb.getNumChannels(); ++ch)
                sb.addFrom (ch, 0, trackScratch, jmin (ch, srcCh - 1), 0, numSamples, amt);
        }
    }

    float peak = 0.0f;
    for (int ch = 0; ch < srcCh; ++ch)
        peak = jmax (peak, trackScratch.getMagnitude (ch, 0, numSamples));
    level.store (jmax (peak, level.load() * 0.88f));
}
