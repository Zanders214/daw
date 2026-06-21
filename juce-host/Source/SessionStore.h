#pragma once

#include <JuceHeader.h>

/**
 * SessionStore — reliable on-disk persistence for DAW sessions and global
 * preferences, stored as JSON in the user app-data dir (same location as
 * PluginHost's plugins.json). It is pure storage: it reads/writes juce::var
 * trees and knows nothing about the engine or the UI schema.
 *
 *   ZandersDAW/prefs.json             global preferences (one record)
 *   ZandersDAW/sessions/<name>.json   named sessions (names starting with '_'
 *                                     are reserved, e.g. __autosave__)
 */
class SessionStore
{
public:
    juce::File getBaseDir() const;        // ZandersDAW/
    juce::File getSessionsDir() const;    // ZandersDAW/sessions/
    juce::File sessionFile (const juce::String& name) const;
    juce::File getPrefsFile() const;      // ZandersDAW/prefs.json

    bool writeSession (const juce::String& name, const juce::var& data) const;
    juce::var readSession (const juce::String& name) const;   // {} if missing/invalid
    bool deleteSession (const juce::String& name) const;
    /** Saved sessions as an array of { name, savedAt }, excluding reserved
        names whose file stem starts with '_'. */
    juce::var listSessions() const;

    bool writePrefs (const juce::var& data) const;
    juce::var readPrefs() const;                               // {} if missing/invalid

    /** Map an arbitrary session name to a safe, stable filename stem. */
    static juce::String sanitize (const juce::String& name);
};
