#pragma once

#include <JuceHeader.h>
#include "DeviceRack.h"
#include <atomic>
#include <map>
#include <vector>

/**
 * AutomationStore — block-accurate parameter automation evaluated on the audio
 * thread. Each lane maps a key to a time-sorted breakpoint list plus a write
 * target that was resolved on the message thread (by AudioEngine, which owns the
 * node lookup). The audio thread therefore only ever dereferences a raw atomic
 * pointer — it never resolves nodes or takes the mixer lock.
 *
 * Threading mirrors DeviceRack: the message thread mutates under `lock`; the
 * audio thread reads under a try-lock and skips the block on a miss, so a (rare)
 * edit never blocks audio and the manual atomic values simply persist that block.
 */
class AutomationStore
{
public:
    struct Point { double t; float v; };

    /** Where an evaluated value is written. `f32` writes the same atomic the
        manual setter does (gain / pan / send / return / master). `param` writes
        a hosted plugin parameter via a stable DeviceRack* (the instance is
        looked up under the rack's lock at apply time, so a removed device simply
        no-ops — no dangling pointer). `none` is inert (e.g. legacy params). */
    enum class Kind { none, f32, param };
    struct Target
    {
        Kind kind { Kind::none };
        std::atomic<float>* f32 { nullptr };
        float lo { 0.0f };
        float hi { 1.0f };
        DeviceRack* rack { nullptr };
        int slot { 0 };
        int paramIndex { 0 };
    };

    // ---- message thread ----
    void set (const juce::String& key, std::vector<Point> points, const Target& target)
    {
        std::sort (points.begin(), points.end(),
                   [] (const Point& a, const Point& b) { return a.t < b.t; });
        const juce::ScopedLock sl (lock);
        lanes[key] = Lane { std::move (points), target };
    }

    void clear (const juce::String& key)
    {
        const juce::ScopedLock sl (lock);
        lanes.erase (key);
    }

    void clearAll()
    {
        const juce::ScopedLock sl (lock);
        lanes.clear();
    }

    // ---- audio thread ----
    /** Evaluate every lane at `beats` (block-start playhead) and write to its
        target. Lock-free on a missed try-lock (manual values persist). */
    void apply (double beats) const
    {
        const juce::ScopedTryLock stl (lock);
        if (! stl.isLocked())
            return;

        for (const auto& [key, lane] : lanes)
        {
            const float v = valueAt (lane.points, beats);
            if (lane.target.kind == Kind::f32)
            {
                if (lane.target.f32 != nullptr)
                    lane.target.f32->store (juce::jlimit (lane.target.lo, lane.target.hi, v));
            }
            else if (lane.target.kind == Kind::param && lane.target.rack != nullptr)
            {
                lane.target.rack->setParamValue (lane.target.slot, lane.target.paramIndex, v);
            }
        }
    }

private:
    struct Lane
    {
        std::vector<Point> points;
        Target target;
    };

    /** Linear interpolation matching the JS `valAt`: clamp before the first /
        after the last point, lerp between the bracketing points. */
    static float valueAt (const std::vector<Point>& pts, double t)
    {
        if (pts.empty())
            return 0.0f;
        if (t <= pts.front().t)
            return pts.front().v;
        for (size_t i = 1; i < pts.size(); ++i)
            if (t <= pts[i].t)
            {
                const Point& a = pts[i - 1];
                const Point& b = pts[i];
                const double span = b.t - a.t;
                const double f = span > 0.0 ? (t - a.t) / span : 0.0;
                return (float) (a.v + (b.v - a.v) * f);
            }
        return pts.back().v;
    }

    juce::CriticalSection lock;
    std::map<juce::String, Lane> lanes;
};
