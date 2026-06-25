// perf_bench — micro-benchmark the AudioEngine render path and emit a JSON metric
// for github-action-benchmark (customSmallerIsBetter). Same headless MIDI-only
// steady state as rt_check (EngineHarness): one grouped synth track holding a
// chord, so the number reflects real per-block mixing + voice rendering cost.

#define ANKERL_NANOBENCH_IMPLEMENT
#include <nanobench.h>

#include "EngineHarness.h"
#include <cstdio>

int main (int argc, char** argv)
{
    zd_test::EngineHarness h (48000.0, 512);

    // Warm up so voices are sounding (ADSR past attack) before we measure.
    for (int i = 0; i < 32; ++i)
        h.renderBlock();

    ankerl::nanobench::Bench bench;
    bench.title ("Engine @48k/512").unit ("block").warmup (20).minEpochIterations (200);
    bench.run ("engineBlock", [&]
    {
        h.renderBlock();
        ankerl::nanobench::doNotOptimizeAway (h.sentinel());
    });

    // The Measure enum is nested in Result, not the namespace. median() is seconds.
    const double ns       = bench.results().back().median (ankerl::nanobench::Result::Measure::elapsed) * 1.0e9;
    const double budgetNs = (double) h.blockSize / h.sampleRate * 1.0e9;   // 10.67 ms @48k/512
    const double loadPct  = ns / budgetNs * 100.0;                         // <100% = real-time capable

    juce::String json;
    json << "[\n"
         << "  { \"name\": \"engineBlock\",       \"unit\": \"ns/block\", \"value\": " << juce::String (ns, 3)      << " },\n"
         << "  { \"name\": \"DSP load @48k/512\", \"unit\": \"%\",        \"value\": " << juce::String (loadPct, 3) << " }\n"
         << "]\n";

    const juce::String out = (argc > 1) ? juce::String (argv[1]) : juce::String ("bench_result.json");
    juce::File::getCurrentWorkingDirectory().getChildFile (out).replaceWithText (json);

    std::printf ("engineBlock=%.0f ns (%.1f%% RT load)\n", ns, loadPct);
    return 0;
}
