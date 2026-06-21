#pragma once

#include <JuceHeader.h>
#include "PluginEditorWindow.h"

/**
 * DeviceRack — an insert-FX chain for one mix node (track / group / return).
 * Mirrors the master chain: three reserved slots (eq → tape → pre), each an
 * optional plugin instance, processed in series. Threading matches the master
 * chain: the message thread mutates under `lock`; the audio thread processes
 * under a try-lock so a (rare) load never blocks audio. Slots map to the same
 * indices as PluginHost (0=eq, 1=tape, 2=pre).
 */
class DeviceRack
{
public:
    static constexpr int numSlots = 3;

    DeviceRack() = default;
    ~DeviceRack() { closeAllEditors(); }

    // ---- message thread ----
    void prepare (double sr, int bs)
    {
        sampleRate = sr;
        blockSize = bs;
        const juce::ScopedLock sl (lock);
        for (const auto& p : chain)
            prepareInstance (p.get());
    }

    void release() const
    {
        const juce::ScopedLock sl (lock);
        for (const auto& p : chain)
            if (p != nullptr)
                p->releaseResources();
    }

    void install (int slot, std::unique_ptr<juce::AudioPluginInstance> inst)
    {
        if (! juce::isPositiveAndBelow (slot, numSlots) || inst == nullptr)
            return;
        prepareInstance (inst.get());
        const juce::ScopedLock sl (lock);
        if (chain[(size_t) slot] != nullptr)
            chain[(size_t) slot]->releaseResources();
        chain[(size_t) slot] = std::move (inst);
    }

    void remove (int slot)
    {
        if (! juce::isPositiveAndBelow (slot, numSlots))
            return;
        closeEditor (slot);
        const juce::ScopedLock sl (lock);
        if (chain[(size_t) slot] != nullptr)
            chain[(size_t) slot]->releaseResources();
        chain[(size_t) slot].reset();
    }

    bool has (int slot) const { return juce::isPositiveAndBelow (slot, numSlots) && chain[(size_t) slot] != nullptr; }
    void setBypass (int slot, bool b) { if (juce::isPositiveAndBelow (slot, numSlots)) bypassed[(size_t) slot].store (b); }
    bool isBypassed (int slot) const { return juce::isPositiveAndBelow (slot, numSlots) && bypassed[(size_t) slot].load(); }
    juce::AudioPluginInstance* get (int slot) const { return juce::isPositiveAndBelow (slot, numSlots) ? chain[(size_t) slot].get() : nullptr; }

    void openEditor (int slot)
    {
        auto* inst = get (slot);
        if (inst == nullptr)
            return;
        if (editors[(size_t) slot] != nullptr) { editors[(size_t) slot]->toFront (true); return; }
        editors[(size_t) slot] = PluginEditorWindow::openFor (*inst, [this, slot] { closeEditor (slot); });
    }

    void closeEditor (int slot)
    {
        if (juce::isPositiveAndBelow (slot, numSlots) && editors[(size_t) slot] != nullptr)
        {
            editors[(size_t) slot]->clearContentComponent();
            editors[(size_t) slot].reset();
        }
    }

    void closeAllEditors() { for (int i = 0; i < numSlots; ++i) closeEditor (i); }

    juce::String getState (int slot) const
    {
        auto* inst = get (slot);
        if (inst == nullptr)
            return {};
        const juce::ScopedLock sl (lock);
        juce::MemoryBlock mb;
        inst->getStateInformation (mb);
        return mb.toBase64Encoding();
    }

    void setState (int slot, const juce::String& b64) const
    {
        auto* inst = get (slot);
        if (inst == nullptr || b64.isEmpty())
            return;
        juce::MemoryBlock mb;
        if (! mb.fromBase64Encoding (b64))
            return;
        const juce::ScopedLock sl (lock);
        inst->setStateInformation (mb.getData(), (int) mb.getSize());
    }

    // ---- audio thread ----
    void process (juce::AudioBuffer<float>& buf, juce::MidiBuffer& midi)
    {
        const juce::ScopedTryLock stl (lock);
        if (! stl.isLocked())
            return;
        for (int i = 0; i < numSlots; ++i)
            if (auto* inst = chain[(size_t) i].get())
                if (! bypassed[(size_t) i].load())
                    inst->processBlock (buf, midi);
    }

    /** Automation: set a hosted parameter by index (normalized 0..1) under a
        try-lock; no-op if the slot/index is empty or a load is in progress. Uses
        setValue (not setValueNotifyingHost) — called every block, so it must not
        flood host-notification listeners. */
    void setParamValue (int slot, int paramIndex, float value01)
    {
        if (! juce::isPositiveAndBelow (slot, numSlots))
            return;
        const juce::ScopedTryLock stl (lock);
        if (! stl.isLocked())
            return;
        if (const auto* inst = chain[(size_t) slot].get())
        {
            const auto& params = inst->getParameters();
            if (juce::isPositiveAndBelow (paramIndex, params.size()))
                params[paramIndex]->setValue (juce::jlimit (0.0f, 1.0f, value01));
        }
    }

private:
    void prepareInstance (juce::AudioPluginInstance* inst) const
    {
        if (inst == nullptr || sampleRate <= 0.0)
            return;
        inst->enableAllBuses();
        inst->setPlayConfigDetails (2, 2, sampleRate, blockSize);
        inst->prepareToPlay (sampleRate, blockSize);
    }

    juce::CriticalSection lock;
    std::array<std::unique_ptr<juce::AudioPluginInstance>, numSlots> chain;
    std::array<std::atomic<bool>, numSlots> bypassed { { {false}, {false}, {false} } };
    std::array<std::unique_ptr<PluginEditorWindow>, numSlots> editors;
    double sampleRate { 0.0 };
    int blockSize { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DeviceRack)
};
