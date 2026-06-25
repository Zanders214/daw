// rt_check — drive the AudioEngine render path headless so a sanitizer can audit
// the real-time thread. Built three ways from one source (see juce-host/CMakeLists.txt):
//
//   * rt_check       (-fsanitize=realtime, defines ZD_RT_NONBLOCKING):
//                    fails if any [[clang::nonblocking]] leaf DSP allocates / locks /
//                    syscalls on the audio thread.
//   * engine_check   (-fsanitize=address|undefined): memory / UB audit of the engine.
//   * engine_check   (-fsanitize=thread, defines ZD_CONCURRENT_CONTROL): a control
//                    thread mutates transport/engine state while the render loop runs,
//                    so TSan can find data races between the "message" and audio threads.
//
// All variants render the same MIDI-only steady state from EngineHarness.

#include "EngineHarness.h"
#include <cstdio>

#ifdef ZD_CONCURRENT_CONTROL
 #include <atomic>
 #include <thread>
#endif

int main()
{
    zd_test::EngineHarness h (48000.0, 512);
    const int blocks = (int) (h.sampleRate / h.blockSize) * 2;   // ~2 s of callbacks

#ifdef ZD_CONCURRENT_CONTROL
    // Mirror the real message-thread / audio-thread split: hammer the public
    // setters (which the UI normally calls) while audio renders. The mixer's
    // try-locks make this safe; an *unsynchronised* field shows up as a TSan race.
    std::atomic<bool> stop { false };
    std::thread control ([&]
    {
        for (int i = 0; ! stop.load (std::memory_order_relaxed); ++i)
        {
            h.engine.setInputMode ((i & 1) ? "input" : "file"); // unguarded String r/w vs audio thread
            h.engine.setTempo (118.0 + (double) (i % 12));
            h.engine.setPosition ((double) (i % 64));
            std::this_thread::yield();
        }
    });
#endif

    volatile float sink = 0.0f;
    for (int b = 0; b < blocks; ++b)
    {
        h.renderBlock();
        sink += h.sentinel();
    }

#ifdef ZD_CONCURRENT_CONTROL
    stop.store (true);
    control.join();
#endif

    std::printf ("PASS: %d engine blocks rendered (sink=%g)\n", blocks, (double) sink);
    return 0;
}
