#include "PluginHost.h"

using namespace juce;

PluginHost::PluginHost()
{
    // Adds VST3 (all platforms) and AU (macOS) when the JUCE_PLUGINHOST_* defines are set.
    formatManager.addDefaultFormats();
    loadConfig();
}

int PluginHost::slotIndex (const String& key)
{
    if (key == "eq")   return 0;
    if (key == "tape") return 1;
    if (key == "pre")  return 2;
    return -1;
}

String PluginHost::slotKey (int index)
{
    switch (index)
    {
        case 0: return "eq";
        case 1: return "tape";
        case 2: return "pre";
        default: return {};
    }
}

String PluginHost::expectedPluginName (int index)
{
    switch (index)
    {
        case 0: return "ZandersEQ";
        case 1: return "ZandersTapeStop";
        case 2: return "ZandersPreDrop";
        default: return {};
    }
}

bool PluginHost::describeFile (const File& file, PluginDescription& outDesc) const
{
    OwnedArray<PluginDescription> found;
    for (auto* format : formatManager.getFormats())
        if (format->fileMightContainThisPluginType (file.getFullPathName()))
            format->findAllTypesForFile (found, file.getFullPathName());

    if (found.isEmpty())
        return false;

    outDesc = *found.getFirst();
    return true;
}

void PluginHost::createAsync (const PluginDescription& desc, double sampleRate, int blockSize,
                              const CreateCallback& cb)
{
    formatManager.createPluginInstanceAsync (
        desc, sampleRate, blockSize,
        [cb] (std::unique_ptr<AudioPluginInstance> instance, const String& error)
        {
            cb (std::move (instance), error);
        });
}

static void reportMatchingSlots (const File& f, const std::function<void (int, File)>& onFound)
{
    const auto name = f.getFileNameWithoutExtension();
    for (int slot = 0; slot < PluginHost::numSlots; ++slot)
        if (name.containsIgnoreCase (PluginHost::expectedPluginName (slot)))
            onFound (slot, f);
}

void PluginHost::scanDefaultLocations (const std::function<void (int, File)>& onFound) const
{
    for (auto* format : formatManager.getFormats())
    {
        const auto locations = format->getDefaultLocationsToSearch();
        const auto files = format->searchPathsForPlugins (locations, true, false);
        for (const auto& path : files)
            reportMatchingSlots (File (path), onFound);
    }
}

File PluginHost::getConfigFile() const
{
    return File::getSpecialLocation (File::userApplicationDataDirectory)
        .getChildFile ("ZandersDAW")
        .getChildFile ("plugins.json");
}

void PluginHost::loadConfig()
{
    auto file = getConfigFile();
    if (! file.existsAsFile())
        return;

    auto json = JSON::parse (file);
    if (const auto* obj = json.getDynamicObject())
        for (int i = 0; i < numSlots; ++i)
            slotPaths[i] = obj->getProperty (slotKey (i)).toString();
}

void PluginHost::saveConfig() const
{
    auto* obj = new DynamicObject();
    for (int i = 0; i < numSlots; ++i)
        obj->setProperty (slotKey (i), slotPaths[i]);

    auto file = getConfigFile();
    file.getParentDirectory().createDirectory();
    file.replaceWithText (JSON::toString (var (obj)));
}

String PluginHost::getSlotPath (int index) const
{
    return (index >= 0 && index < numSlots) ? slotPaths[index] : String();
}

void PluginHost::setSlotPath (int index, const String& path)
{
    if (index >= 0 && index < numSlots)
        slotPaths[index] = path;
}
