#pragma once

#include <JuceHeader.h>
#include <functional>
#include <array>

/**
 * PluginHost — plugin format management, discovery and asynchronous
 * instantiation for the three reserved device slots (eq / tape / pre).
 * It does NOT own the running instances (AudioEngine does); it produces them
 * and persists which .vst3 file backs each slot.
 */
class PluginHost
{
public:
    PluginHost();

    static constexpr int numSlots = 3;

    /** "eq" -> 0, "tape" -> 1, "pre" -> 2, else -1. */
    static int slotIndex (const juce::String& key);
    static juce::String slotKey (int index);
    /** The plugin product name we expect for each slot, used by auto-scan. */
    static juce::String expectedPluginName (int index);

    using CreateCallback =
        std::function<void (std::unique_ptr<juce::AudioPluginInstance>, const juce::String& error)>;

    /** Find a PluginDescription for a file (e.g. a .vst3 bundle). */
    bool describeFile (const juce::File& file, juce::PluginDescription& outDesc) const;

    /** Instantiate asynchronously (calls back on the message thread). */
    void createAsync (const juce::PluginDescription& desc, double sampleRate, int blockSize,
                      const CreateCallback& cb);

    /** Scan the default VST3/AU locations and report files whose name matches a slot. */
    void scanDefaultLocations (const std::function<void (int slotIndex, juce::File)>& onFound) const;

    // Persisted slot -> path config (JSON in the user app-data dir).
    juce::File getConfigFile() const;
    void loadConfig();
    void saveConfig() const;
    juce::String getSlotPath (int index) const;
    void setSlotPath (int index, const juce::String& path);

    juce::AudioPluginFormatManager& getFormatManager() { return formatManager; }

private:
    juce::AudioPluginFormatManager formatManager;
    std::array<juce::String, numSlots> slotPaths;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginHost)
};
