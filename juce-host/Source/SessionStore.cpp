#include "SessionStore.h"

using namespace juce;

File SessionStore::getBaseDir() const
{
    return File::getSpecialLocation (File::userApplicationDataDirectory)
        .getChildFile ("ZandersDAW");
}

File SessionStore::getSessionsDir() const
{
    return getBaseDir().getChildFile ("sessions");
}

File SessionStore::getPrefsFile() const
{
    return getBaseDir().getChildFile ("prefs.json");
}

String SessionStore::sanitize (const String& name)
{
    const auto stem = File::createLegalFileName (name).trim();
    return stem.isEmpty() ? String ("untitled") : stem;
}

File SessionStore::sessionFile (const String& name) const
{
    return getSessionsDir().getChildFile (sanitize (name) + ".json");
}

bool SessionStore::writeSession (const String& name, const var& data) const
{
    auto file = sessionFile (name);
    file.getParentDirectory().createDirectory();
    return file.replaceWithText (JSON::toString (data));
}

var SessionStore::readSession (const String& name) const
{
    auto file = sessionFile (name);
    if (! file.existsAsFile())
        return {};
    return JSON::parse (file);
}

bool SessionStore::deleteSession (const String& name) const
{
    auto file = sessionFile (name);
    return file.existsAsFile() && file.deleteFile();
}

var SessionStore::listSessions() const
{
    Array<var> out;
    for (const auto& entry : getSessionsDir().findChildFiles (File::findFiles, false, "*.json"))
    {
        if (entry.getFileNameWithoutExtension().startsWithChar ('_'))
            continue; // reserved (e.g. __autosave__)

        const auto* obj = JSON::parse (entry).getDynamicObject();

        DynamicObject::Ptr item = new DynamicObject();
        item->setProperty ("name", obj != nullptr && obj->hasProperty ("name")
                                       ? obj->getProperty ("name")
                                       : var (entry.getFileNameWithoutExtension()));
        item->setProperty ("savedAt", obj != nullptr ? obj->getProperty ("savedAt") : var());
        out.add (var (item.get()));
    }
    return out;
}

bool SessionStore::writePrefs (const var& data) const
{
    auto file = getPrefsFile();
    file.getParentDirectory().createDirectory();
    return file.replaceWithText (JSON::toString (data));
}

var SessionStore::readPrefs() const
{
    auto file = getPrefsFile();
    if (! file.existsAsFile())
        return {};
    return JSON::parse (file);
}
