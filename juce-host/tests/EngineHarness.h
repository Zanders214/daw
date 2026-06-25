#pragma once

// Headless harness that drives the real AudioEngine render path with NO audio
// device, NO WebView and NO GUI window — shared by rt_check.cpp (RTSan / ASan /
// UBSan / TSan) and perf_bench.cpp (nanobench).
//
// It builds a worst-ish-case steady state: one MIDI track holding a chord across
// the whole timeline (so the per-track synth voices are always rendering), routed
// through a group bus, panned off-centre and feeding an aux send — exercising the
// per-voice DSP, the per-track gain/pan/meter/send leaves, the group sum and the
// master gain/pan. It stays MIDI-only on purpose: no audio file is loaded, so the
// render path never touches juce::BufferingAudioSource's per-block CriticalSection.

#include <JuceHeader.h>
#include "AudioEngine.h"
#include <vector>

namespace zd_test
{

struct EngineHarness
{
    juce::ScopedJuceInitialiser_GUI juceInit;   // message manager (no window shown)
    AudioEngine engine;
    double sampleRate;
    int    blockSize;
    std::vector<float> ch0, ch1;                 // output channel backing storage

    explicit EngineHarness (double sr = 48000.0, int bs = 512)
        : sampleRate (sr), blockSize (bs),
          ch0 ((size_t) bs, 0.0f), ch1 ((size_t) bs, 0.0f)
    {
        engine.mixer().initialise();             // start the read thread (idle: no files)
        engine.prepareOffline (sr, bs);          // size buffers + prepare mixer/master (no device)

        // One MIDI track, grouped, holding a chord that never ends within the run.
        engine.mixer().createTrack ("bench", "Bench Synth", "midi", "#5cf7ff", "BENCH");

        std::vector<TrackChannel::MidiNoteSpec> notes;
        for (int pitch : { 36, 48, 55, 60, 64, 67 })
            notes.push_back ({ /*absBeat*/ 0.0, /*durBeat*/ 1.0e6, pitch, /*velocity*/ 0.85f });
        engine.mixer().setTrackMidiNotes ("bench", std::move (notes));

        engine.mixer().setTrackPan  ("bench", 0.35f);   // exercise the pan branch
        engine.mixer().setTrackSend ("bench", 0, 0.5f); // exercise the aux-send branch

        engine.setTempo (124.0);
        engine.setLooping (false);                // don't wrap (a wrap panics the synth)
        engine.setPosition (0.0);
        engine.setPlaying (true);
    }

    /** Render one audio block through the full engine callback. */
    void renderBlock()
    {
        float* out[2] = { ch0.data(), ch1.data() };
        engine.audioDeviceIOCallbackWithContext (nullptr, 0, out, 2, blockSize,
                                                 juce::AudioIODeviceCallbackContext {});
    }

    /** A finite value somewhere in the output (so the optimiser can't elide the work). */
    float sentinel() const { return ch0.empty() ? 0.0f : ch0.front(); }
};

} // namespace zd_test
