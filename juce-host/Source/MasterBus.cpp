#include "MasterBus.h"
#include "PluginEditorWindow.h"

using namespace juce;

AudioPluginInstance* MasterBus::getInstance (int slot) const
{
    if (slot < 0 || slot >= numSlots) return nullptr;
    return chain[(size_t) slot].get();
}

void MasterBus::prepareSlot (int slot) const
{
    if (auto* inst = getInstance (slot))
    {
        inst->enableAllBuses();
        inst->setPlayConfigDetails (2, 2, sampleRate, blockSize);
        inst->prepareToPlay (sampleRate, blockSize);
    }
}

void MasterBus::prepare (double sampleRateToUse, int blockSizeToUse)
{
    sampleRate = sampleRateToUse;
    blockSize  = blockSizeToUse;

    const ScopedLock sl (chainLock);
    for (int i = 0; i < numSlots; ++i)
        prepareSlot (i);
}

void MasterBus::releaseResources()
{
    const ScopedLock sl (chainLock);
    for (const auto& p : chain)
        if (p != nullptr)
            p->releaseResources();
}

void MasterBus::process (AudioBuffer<float>& buffer, MidiBuffer& midi)
{
    // Run the master FX chain in series (try-lock so loads never block audio).
    const ScopedTryLock stl (chainLock);
    if (! stl.isLocked())
        return;

    midi.clear();
    for (int i = 0; i < numSlots; ++i)
    {
        auto* inst = chain[(size_t) i].get();
        if (inst == nullptr || bypassed[(size_t) i].load())
            continue;
        inst->processBlock (buffer, midi);
    }
}

void MasterBus::applyMasterGainAndPan (AudioBuffer<float>& buffer, int numSamples) const noexcept
{
    // Master volume.
    buffer.applyGain (masterVolume.load());

    // Master pan (stereo balance; unity at center).
    if (const float mpan = masterPan.load(); buffer.getNumChannels() >= 2 && ! approximatelyEqual (mpan, 0.5f))
    {
        buffer.applyGain (0, 0, numSamples, mpan <= 0.5f ? 1.0f : (1.0f - mpan) * 2.0f);
        buffer.applyGain (1, 0, numSamples, mpan >= 0.5f ? 1.0f : mpan * 2.0f);
    }
}

void MasterBus::installPlugin (int slot, std::unique_ptr<AudioPluginInstance> instance)
{
    if (slot < 0 || slot >= numSlots)
        return;

    {
        const ScopedLock sl (chainLock);
        if (chain[(size_t) slot] != nullptr)
            chain[(size_t) slot]->releaseResources();
        chain[(size_t) slot] = std::move (instance);
    }
    prepareSlot (slot);
}

void MasterBus::removePlugin (int slot)
{
    if (slot < 0 || slot >= numSlots)
        return;
    closeEditor (slot);
    const ScopedLock sl (chainLock);
    if (chain[(size_t) slot] != nullptr)
        chain[(size_t) slot]->releaseResources();
    chain[(size_t) slot].reset();
}

bool MasterBus::hasPlugin (int slot) const { return getInstance (slot) != nullptr; }

String MasterBus::getPluginName (int slot) const
{
    const auto* inst = getInstance (slot);
    return inst != nullptr ? inst->getName() : String();
}

void MasterBus::setBypassed (int slot, bool b)
{
    if (slot >= 0 && slot < numSlots)
        bypassed[(size_t) slot].store (b);
}

void MasterBus::setParam (int slot, const String& paramId, float value01) const
{
    const auto* inst = getInstance (slot);
    if (inst == nullptr)
        return;

    const auto& params = inst->getParameters();

    // Resolve by numeric index first, then by (partial) name match.
    int index = paramId.containsOnly ("0123456789") ? paramId.getIntValue() : -1;
    if (index < 0)
        for (int i = 0; i < params.size(); ++i)
            if (params[i]->getName (64).containsIgnoreCase (paramId))
                { index = i; break; }

    if (isPositiveAndBelow (index, params.size()))
        params[index]->setValueNotifyingHost (jlimit (0.0f, 1.0f, value01));
}

var MasterBus::listParams (int slot) const
{
    Array<var> out;
    if (const auto* inst = getInstance (slot))
    {
        const auto& params = inst->getParameters();
        for (int i = 0; i < params.size(); ++i)
        {
            DynamicObject::Ptr obj = new DynamicObject();
            obj->setProperty ("id", String (i));
            obj->setProperty ("name", params[i]->getName (64));
            obj->setProperty ("value", params[i]->getValue());
            obj->setProperty ("text", params[i]->getText (params[i]->getValue(), 0));
            out.add (var (obj.get()));
        }
    }
    return out;
}

String MasterBus::getPluginState (int slot) const
{
    auto* inst = getInstance (slot);
    if (inst == nullptr)
        return {};

    // Guard against a concurrent processBlock (audio thread try-locks chainLock).
    const ScopedLock sl (chainLock);
    juce::MemoryBlock mb;
    inst->getStateInformation (mb);
    return mb.toBase64Encoding();
}

bool MasterBus::setPluginState (int slot, const String& base64) const
{
    auto* inst = getInstance (slot);
    if (inst == nullptr || base64.isEmpty())
        return false;

    juce::MemoryBlock mb;
    if (! mb.fromBase64Encoding (base64) || mb.isEmpty())
        return false;

    const ScopedLock sl (chainLock);
    inst->setStateInformation (mb.getData(), (int) mb.getSize());
    return true;
}

void MasterBus::openEditor (int slot)
{
    auto* inst = getInstance (slot);
    if (inst == nullptr)
        return;

    if (editorWindows[(size_t) slot] != nullptr)
    {
        editorWindows[(size_t) slot]->toFront (true);
        return;
    }

    auto window = std::make_unique<PluginEditorWindow> (inst->getName());
    if (inst->hasEditor())
    {
        if (auto* editor = inst->createEditorIfNeeded())
            window->setContentNonOwned (editor, true);
        else
            window->setContentOwned (new GenericAudioProcessorEditor (*inst), true);
    }
    else
    {
        window->setContentOwned (new GenericAudioProcessorEditor (*inst), true);
    }

    window->onCloseCallback = [this, slot] { closeEditor (slot); };
    window->setResizable (true, false);
    window->centreWithSize (window->getWidth(), window->getHeight());
    window->setVisible (true);
    editorWindows[(size_t) slot] = std::move (window);
}

void MasterBus::closeEditor (int slot)
{
    if (slot < 0 || slot >= numSlots)
        return;
    if (editorWindows[(size_t) slot] != nullptr)
    {
        editorWindows[(size_t) slot]->clearContentComponent();
        editorWindows[(size_t) slot].reset();
    }
}

void MasterBus::closeAllEditors()
{
    for (int i = 0; i < numSlots; ++i)
        closeEditor (i);
}
