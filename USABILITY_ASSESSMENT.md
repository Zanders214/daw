# Usability Assessment — Zanders DAW

> **Date:** 2026-06-24
> **Scope:** What needs to be improved or implemented to make this project an
> *actually usable* DAW — not just a good-looking one.

---

## TL;DR

The looks are not the problem. The **React UI is genuinely complete and well-tested**,
and the **native JUCE engine already does real per-track audio-file mixing** (groups,
sends/returns, insert-FX racks, a master FX chain, parameter automation, and VST3
*effect* hosting). What's missing is the thing that makes a DAW a DAW: the
**record → arrange → play instruments → bounce** loop.

Concretely, in the build that actually makes sound (the JUCE host):

- **MIDI you draw is silent** — no instrument is hosted, so the piano roll plays nothing.
- **Recording does nothing** — the button flips a flag that is never read.
- **The arrangement on screen is not the arrangement that plays** — the engine plays one
  whole file per track and ignores clip positions, multiple clips, and all MIDI clips.
- **You can't export your work to audio** — "export" only saves the project file.

And in the browser build, audio is a *simulation*: a toy synth plays MIDI through a
sawtooth/noise voice; real audio files never decode or play at all.

So today this is best described as a **high-fidelity DAW prototype / demo**, not a tool
you can make a track in. The sections below list every gap, with file references, ordered
by how much each one blocks real use.

---

## What actually works today

It's worth being honest about how much *is* built, because it changes what's left to do.

| Area | State | Where |
|---|---|---|
| Full DAW UI (transport, arrange, piano roll, mixer, groups, sends/returns, automation lanes, device racks, browser, settings, sessions) | **Complete & wired** | `src/components/**`, `src/store/useDawStore.ts` |
| State management (100+ actions, transport, selection, mixer, automation) | **Complete** | `src/store/useDawStore.ts` |
| Browser audio *simulation* (toy synth, metronome, metering, virtual mixer) | **Works as a demo** | `src/lib/audio.ts`, `playback.ts`, `mixerGraph.ts`, `hooks/useTransportLoop.ts` |
| Native multitrack mixing of **audio files** (per-track gain/pan/mute/solo, groups, sends/returns, inserts, master chain) | **Implemented** | `juce-host/Source/AudioEngine.cpp`, `TrackChannel.cpp`, `GroupBus.h`, `DeviceRack.h` |
| Parameter automation driving the engine (vol/pan/sends/device params) | **Implemented** | `AudioEngine.cpp` (`resolveAutoTarget`, `automation.apply`) |
| VST3 **effect** hosting incl. editor windows + state save/load | **Implemented** | `AudioEngine.cpp` (`installPlugin`, `getPluginState`/`setPluginState`, `openEditor`) |
| Session save/load + autosave (localStorage in browser, JSON files natively) | **Implemented** | `src/lib/sessionStore.ts`, `session.ts`, `autosave.ts` |
| Test coverage (~50 Vitest/RTL files, fake Web Audio) | **Good** | `src/**/*.test.ts(x)`, `src/test/` |

The remaining work is not "polish the UI." It's "make the audio engine do what the UI
already implies."

---

## P0 — Critical blockers (it is not a DAW without these)

### 1. MIDI produces no sound in the real engine

There is **no instrument/synth hosted in the native engine**. Every `MidiBuffer` handed to
the plugin chain is cleared first, and the per-track insert rack is explicitly fed an empty
MIDI buffer:

- `juce-host/Source/AudioEngine.cpp:818,838` — `midi.clear()` before `processBlock`.
- `juce-host/Source/TrackChannel.h:93` — `juce::MidiBuffer rackMidi; // empty MIDI for the insert chain`.

The only thing that ever turns a MIDI note into sound is the **browser toy synth**
(`src/lib/audio.ts` — a single sawtooth oscillator + a noise drum voice). The piano roll,
the MIDI clips, the whole composition workflow — all silent in the actual product.

**To implement:** per-track **VST3 instrument (VSTi) hosting**, and a scheduler that turns
clip notes into timestamped MIDI events fed to that instrument sample-accurately. Ship at
least one built-in instrument so a new project can make sound without external plugins.

### 2. Recording does nothing

The transport "REC" button reaches the engine, but the engine only stores a flag and never
acts on it. There is no `AudioFormatWriter`, no disk capture, nowhere in the audio callback
that reads `recording`:

- `juce-host/Source/AudioEngine.h:46` — `void setRecording (bool b) { recording.store (b); }`
- `juce-host/Source/AudioEngine.h:209` — `std::atomic<bool> recording { false };` (written, never read)
- `src/store/useDawStore.ts` `toggleRecord` — in the browser it just flips a boolean.

**To implement:** arm-track → capture the selected input → stream to a file off the audio
thread → create a clip on the armed track at the record start position. (Count-in already
exists in the UI.)

### 3. The timeline you build is not the timeline that plays

This is the deepest architectural gap. The arrange view models **multiple clips per track at
bar positions, with lengths, plus MIDI clips** (`src/types.ts` — `Clip { bar, len, notes }`).
The engine models **one whole audio file per track**, played from the playhead via a single
transport source:

- `juce-host/Source/TrackChannel.cpp` — `loadFile` / `renderInto` read from one
  `AudioTransportSource`; there is no concept of clips, clip offsets, or clip boundaries.
- `juce-host/Source/AudioEngine.cpp` — `assignTrackFile` assigns a single file per track id.

So an arrangement you carefully build on screen does not correspond to what you hear. Audio
clips are decorative; MIDI clips are inaudible (see #1).

**To implement:** a real **clip/timeline playback model** in the engine — per-clip
scheduling with sample-accurate start/stop, source offsets, and fades; multiple clips per
track; and the MIDI-clip → instrument path from #1.

### 4. No audio export / bounce

"Export" exports the **project file**, not audio. There is no offline render anywhere:

- `juce-host/Source/EngineController.cpp:340` — `sessionExport` writes a `*.zdaw` JSON file.
- No `AudioFormatWriter` / offline render exists in the codebase.

A DAW that can't produce an audio file isn't finished. **To implement:** offline bounce of
the arrangement (whole timeline and/or loop region) to WAV (and ideally MP3).

---

## P1 — Important gaps (needed before anyone could do real work in it)

### 5. No undo/redo at all

There is **no history/undo stack** in the store. (The only `undo` references in the codebase
are an unrelated layout self-undo in `src/hooks/useResponsiveLayout.ts` and a comment in the
store about automation.) Every destructive edit — delete a clip, move a note, drop a track —
is permanent. This is non-negotiable for real editing.

**To implement:** an undo/redo system over store mutations (command pattern or state
snapshots), with the standard Ctrl/Cmd-Z / Shift-Z bindings.

### 6. The browser never plays real audio files

No `decodeAudioData` exists anywhere; `createBufferSource` is used **only** for the
drum-noise synth (`src/lib/audio.ts:87`). So in the browser build, audio tracks and dropped
samples are completely silent — only synthesized MIDI makes sound.

**To implement (browser):** decode dropped/loaded audio into `AudioBuffer`s and play them
through the existing mixer graph, so the browser build is a faithful preview of the native
engine.

### 7. Audio clips show a fake waveform

Audio clips render a decorative repeating gradient (`src/components/arrange/TrackLane.tsx`),
not the actual sample peaks. Users can't see transients, edit to the beat, or trust what
they're looking at.

**To implement:** compute and render real waveform peak data from the audio source.

### 8. No real MIDI hardware input

Settings list MIDI input devices, but nothing captures incoming MIDI — you can't play or
record from a keyboard.

**To implement:** open the selected MIDI input, route note events to the armed track's
instrument (live monitor + recording), and honor the existing "MIDI Thru" toggle.

### 9. The browser/library content is hardcoded and non-functional

The instrument/FX/sample library is static seed data (`src/data/seed.ts`). Dragging an
instrument or effect onto a track doesn't load a real plugin, instrument, or sample — it
only updates UI state (and natively, even effect assignment depends on plugins being present).

**To implement:** wire the browser to real, loadable instruments/effects/samples (tie into
#1 for instruments and the native plugin scanner that already exists).

---

## P2 — Polish / quality

### 10. Plugin device UIs are decorative placeholders

`src/components/devices/ZandersEQ.tsx` and `ZandersTapeStop.tsx` are static SVG mockups with
no parameter control; real editing only happens in native plugin windows. `ZandersPreDrop`
is the only in-app device whose control is actually wired to the engine.

**To implement (optional):** real in-app editors for the house plugins, or lean on the
native editor windows and remove the misleading mockups.

### 11. Smaller items

- Keyboard-shortcut discoverability (shortcuts exist for clips/notes, but there's no help/legend).
- Recording-related UI states (input selection, monitoring) need wiring once #2 lands.

---

## Cross-cutting — build & distribution

### 12. The only build that makes real audio is hard to run, and can't run here

The browser/Tauri build is a simulation; the **JUCE host is the real product**, and it:

- must be built manually with CMake (`juce-host/README.md`), and per that README
  **"can't be built in the cloud sandbox"**;
- requires **three externally-built VST3 plugins** (`Zanders214/eq`, `pre-drop`,
  `tape-stop`) to be compiled or downloaded separately and placed where it can find them.

So a fresh checkout cannot produce a working, sound-making DAW without significant out-of-band
setup, and there are no default built-in instruments/effects to fall back on.

**To address:** document and streamline the native build; bundle a couple of default
built-in instruments/effects so a fresh install makes sound immediately; and consider CI that
produces runnable host artifacts.

---

## Suggested build order (to reach "usable")

This sequence front-loads the architectural work that everything else depends on:

1. **Engine clip/timeline playback model** (P0-3) — the foundation; nothing else is honest
   until the engine plays what the timeline shows.
2. **VSTi instrument hosting + MIDI scheduling** (P0-1) — makes the piano roll/MIDI clips
   audible; ship one built-in instrument.
3. **Recording to disk** (P0-2) — capture audio (and, with #8, MIDI) into clips.
4. **Offline bounce/export** (P0-4) — let users get a finished file out.
5. **Undo/redo** (P1-5) — make editing safe.
6. **Real waveforms + browser sample playback** (P1-6, P1-7) — make audio tracks real and
   the browser build a faithful preview.
7. **MIDI hardware input** (P1-8) — play and record from a keyboard.
8. **Real library + packaged build with bundled default plugins** (P1-9, P2, build) — make a
   fresh install productive out of the box.

Items 1–4 are the line between "demo" and "DAW." Items 5–8 are the line between "DAW" and
"a DAW people would choose to use."

---

## A note on framing

None of this should read as "the work so far is wasted." The UI, the state model, the
session/persistence layer, and a real multitrack-audio mixing engine with VST3 effects and
automation are substantial and largely done. The gap is specific and well-defined: the engine
needs a clip/timeline model and instruments, plus recording and export — and the browser build
needs to play real audio. Close those, and the looks finally have a working DAW underneath them.
