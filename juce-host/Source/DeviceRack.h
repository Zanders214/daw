#pragma once

#include <JuceHeader.h>
#include "PluginEditorWindow.h"

/**
 * DeviceRack — an insert-FX chain for one mix node (track / group / return).
 * An ordered list of arbitrary plugin instances, each self-describing (a stable
 * frontend-generated instance id, a `kind` — a built-in key like "eq"/"tape"/"pre"
 * or "vst3" for an external plugin — an optional file path, and a display name),
 * processed in series. A device may be a placeholder (null instance) while it
 * loads asynchronously, or when an external plugin could not be located
 * (`missing`); the audio thread simply skips it.
 *
 * Threading matches the master chain: the message thread mutates under `lock`;
 * the audio thread processes under a try-lock so a (rare) load never blocks audio.
 * Devices are addressed by their instance id, never by position.
 */
class DeviceRack
{
public:
    struct Device
    {
        juce::String id;     // stable instance id (frontend-generated)
        juce::String kind;   // "eq" | "tape" | "pre" | "vst3" | other built-in token
        juce::String path;   // VST3/AU path for external; empty for built-ins
        juce::String name;   // display name (instance name once loaded)
        std::unique_ptr<juce::AudioPluginInstance> instance;
        std::atomic<bool> bypassed { false };
        bool missing { false };                       // saved external plugin not found
        std::unique_ptr<PluginEditorWindow> editor;
    };

    DeviceRack() = default;
    ~DeviceRack() { closeAllEditors(); }

    // ---- message thread ----
    void prepare (double sr, int bs)
    {
        sampleRate = sr;
        blockSize = bs;
        const juce::ScopedLock sl (lock);
        for (const auto* d : devices)
            prepareInstance (d->instance.get());
    }

    void release() const
    {
        const juce::ScopedLock sl (lock);
        for (auto* d : devices)
            if (d->instance != nullptr)
                d->instance->releaseResources();
    }

    /** Append a placeholder device (no instance yet) preserving order; the async
        loader fills or marks it later by id. No-op if the id already exists. */
    void addPlaceholder (const juce::String& id, const juce::String& kind,
                         const juce::String& path, const juce::String& name)
    {
        const juce::ScopedLock sl (lock);
        if (findLocked (id) != nullptr)
            return;
        auto d = std::make_unique<Device>();
        d->id = id;
        d->kind = kind;
        d->path = path;
        d->name = name.isNotEmpty() ? name : kind;
        devices.add (d.release());
    }

    /** Fill a placeholder with its loaded instance (prepares it). */
    void fill (const juce::String& id, std::unique_ptr<juce::AudioPluginInstance> inst)
    {
        if (inst == nullptr)
            return;
        prepareInstance (inst.get());
        const juce::ScopedLock sl (lock);
        if (auto* d = findLocked (id))
        {
            if (d->instance != nullptr)
                d->instance->releaseResources();
            d->name = inst->getName();
            d->missing = false;
            d->instance = std::move (inst);
        }
    }

    /** Mark a device as unresolved (external plugin file missing). */
    void markMissing (const juce::String& id)
    {
        const juce::ScopedLock sl (lock);
        if (auto* d = findLocked (id))
            d->missing = true;
    }

    bool remove (const juce::String& id)
    {
        closeEditor (id);
        const juce::ScopedLock sl (lock);
        for (int i = 0; i < devices.size(); ++i)
            if (devices[i]->id == id)
            {
                if (devices[i]->instance != nullptr)
                    devices[i]->instance->releaseResources();
                devices.remove (i); // OwnedArray deletes it
                return true;
            }
        return false;
    }

    bool has (const juce::String& id) const { const juce::ScopedLock sl (lock); return findLocked (id) != nullptr; }
    int  size() const { const juce::ScopedLock sl (lock); return devices.size(); }

    void setBypass (const juce::String& id, bool b)
    {
        const juce::ScopedLock sl (lock);
        if (auto* d = findLocked (id))
            d->bypassed.store (b);
    }

    bool isBypassed (const juce::String& id) const
    {
        const juce::ScopedLock sl (lock);
        const auto* d = findLocked (id);
        return d != nullptr && d->bypassed.load();
    }

    juce::AudioPluginInstance* get (const juce::String& id) const
    {
        const juce::ScopedLock sl (lock);
        const auto* d = findLocked (id);
        return d != nullptr ? d->instance.get() : nullptr;
    }

    void openEditor (const juce::String& id)
    {
        const juce::ScopedLock sl (lock);
        auto* d = findLocked (id);
        if (d == nullptr || d->instance == nullptr)
            return;
        if (d->editor != nullptr) { d->editor->toFront (true); return; }
        d->editor = PluginEditorWindow::openFor (*d->instance, [this, id] { closeEditor (id); });
    }

    void closeEditor (const juce::String& id)
    {
        const juce::ScopedLock sl (lock);
        if (auto* d = findLocked (id); d != nullptr && d->editor != nullptr)
        {
            d->editor->clearContentComponent();
            d->editor.reset();
        }
    }

    void closeAllEditors()
    {
        const juce::ScopedLock sl (lock);
        for (auto* d : devices)
            if (d->editor != nullptr)
            {
                d->editor->clearContentComponent();
                d->editor.reset();
            }
    }

    juce::String getState (const juce::String& id) const
    {
        const juce::ScopedLock sl (lock);
        const auto* d = findLocked (id);
        if (d == nullptr || d->instance == nullptr)
            return {};
        juce::MemoryBlock mb;
        d->instance->getStateInformation (mb);
        return mb.toBase64Encoding();
    }

    void setState (const juce::String& id, const juce::String& b64) const
    {
        if (b64.isEmpty())
            return;
        juce::MemoryBlock mb;
        if (! mb.fromBase64Encoding (b64))
            return;
        const juce::ScopedLock sl (lock);
        const auto* d = findLocked (id);
        if (d != nullptr && d->instance != nullptr)
            d->instance->setStateInformation (mb.getData(), (int) mb.getSize());
    }

    /** Visit each device in chain order under the lock (message thread; used for
        serialization to the web). */
    template <typename Fn>
    void forEach (Fn&& fn) const
    {
        const juce::ScopedLock sl (lock);
        for (const auto* d : devices)
            fn (*d);
    }

    // ---- audio thread ----
    void process (juce::AudioBuffer<float>& buf, juce::MidiBuffer& midi)
    {
        const juce::ScopedTryLock stl (lock);
        if (! stl.isLocked())
            return;
        for (auto* d : devices)
            if (d->instance != nullptr && ! d->bypassed.load())
                d->instance->processBlock (buf, midi);
    }

    /** Automation: set a hosted parameter by index (normalized 0..1) under a
        try-lock; no-op if the device/index is empty or a load is in progress. Uses
        setValue (not setValueNotifyingHost) — called every block, so it must not
        flood host-notification listeners. */
    void setParamValue (const juce::String& id, int paramIndex, float value01)
    {
        const juce::ScopedTryLock stl (lock);
        if (! stl.isLocked())
            return;
        if (const auto* d = findLocked (id); d != nullptr && d->instance != nullptr)
        {
            const auto& params = d->instance->getParameters();
            if (juce::isPositiveAndBelow (paramIndex, params.size()))
                params[paramIndex]->setValue (juce::jlimit (0.0f, 1.0f, value01));
        }
    }

private:
    /** Find a device by id (caller holds `lock`). */
    Device* findLocked (const juce::String& id) const
    {
        for (auto* d : devices)
            if (d->id == id)
                return d;
        return nullptr;
    }

    void prepareInstance (juce::AudioPluginInstance* inst) const
    {
        if (inst == nullptr || sampleRate <= 0.0)
            return;
        inst->enableAllBuses();
        inst->setPlayConfigDetails (2, 2, sampleRate, blockSize);
        inst->prepareToPlay (sampleRate, blockSize);
    }

    mutable juce::CriticalSection lock;
    juce::OwnedArray<Device> devices;
    double sampleRate { 0.0 };
    int blockSize { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DeviceRack)
};
