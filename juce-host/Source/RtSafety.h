#pragma once

// Real-time-safety annotation, opt-in and zero-cost everywhere else.
//
// ZD_RT_NONBLOCKING expands to [[clang::nonblocking]] only in the RealtimeSanitizer
// build (the `rt_check` target defines it on the compile line). In every other
// build — MSVC, normal/release, the ASan/UBSan/TSan targets, and static analysis —
// it expands to nothing, so the annotation is invisible to those toolchains.
//
// Put it on the *leaf* DSP helpers we own (pure float math + atomics), NOT on the
// audio callback or any frame that legitimately takes a try-lock or calls a hosted
// plugin / juce::Synthesiser::renderNextBlock — those acquire CriticalSections that
// RTSan correctly flags. See juce-host/tests/rt_check.cpp and PERFORMANCE notes.
#ifndef ZD_RT_NONBLOCKING
  #define ZD_RT_NONBLOCKING
#endif
