# Zanders DAW

A dark-glass / neon-spectrum **digital audio workstation** desktop app for the
Zanders / Neon Plugins brand. Built as a real cross-platform native application
(Windows + Mac) from a single codebase.

The interface is a faithful, pixel-accurate implementation of the *Zanders DAW*
design handoff: a transport bar, searchable browser, multitrack arrange view
(color-coded clips, MIDI note display, automation lanes, track groups, per-track
volume/mute/solo/arm), a master bus, a device/plugin rack with **reserved slots
for the house VST3 plugins** (EQ · TapeStop · PreDrop), a settings overlay, and
three themes (dark / light / midnight).

## Architecture

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** (Rust + OS-native webview) | Tiny installs (~MBs, not ~120 MB), low memory, real native app — yet renders the exact web UI. |
| UI | **React 18 + TypeScript + Vite** | Matches the design handoff; fast iteration. |
| State | **Zustand** | One store mirroring the design's single state object; per-frame updates isolated to tiny subscribers. |
| Styling | **Plain CSS + design tokens** (CSS custom properties) | Tokens copied verbatim from the handoff; theming via a `data-theme` attribute. |
| Fonts | **Self-hosted `.woff2`** (Space Grotesk + JetBrains Mono, latin subset) | Works fully offline; ~180 KB total. |
| Audio (current) | **Web Audio API** | Metronome click, rAF playhead, and *simulated* metering — exactly as the prototype. |

> **Status:** the UI and all interaction are complete. In a plain browser / the
> Tauri shell, audio is *simulated* (meters, playhead, metronome). The real
> **native VST3 host** — which loads and processes the Zanders plugins and shows
> their native editors — lives in **[`juce-host/`](juce-host/README.md)** (a JUCE
> C++ app that renders this same UI in a WebView and drives a real audio engine).
> The same React build runs in both: `src/lib/engine.ts` detects the JUCE host
> (`window.__JUCE__`) and switches from simulation to the real engine.

## Prerequisites

- **Node.js** 18+ and npm
- **Rust** (stable) + Cargo — install via <https://rustup.rs>
- Platform webview/build dependencies for Tauri — see
  <https://tauri.app/start/prerequisites/> (on Windows: WebView2 + MSVC build
  tools; on macOS: Xcode command-line tools; on Linux: `webkit2gtk` etc.)

## Run locally

```bash
npm install

# Develop the native desktop app (opens the Tauri window with hot reload):
npm run tauri dev

# Build distributable installers (.msi/.exe on Windows, .dmg/.app on macOS):
npm run tauri build
```

The window opens at 1920×1080 (the design's native canvas); the UI scales
uniformly to fit smaller windows.

### Web-only development

You can also iterate on just the UI in a browser (no Rust toolchain needed):

```bash
npm run dev        # Vite dev server at http://localhost:1420
npm run build      # type-check + production web build into dist/
npm run typecheck  # tsc --noEmit
```

## Project structure

```
src/                     React frontend
  store/useDawStore.ts   Zustand store: full app state + actions + per-frame tick
  data/seed.ts           Demo tracks / groups / browser catalog
  lib/engine.ts          Engine client: JS<->C++ bridge (no-op in a plain browser)
  lib/                   audio (metronome), automation, notes, prng, color, constants
  hooks/useEngineBridge  Subscribes to engine state events when hosted by JUCE
  design-system/         The 10 Neon Plugins primitives (Knob, Dial, Slider, Meter,
                         GlowButton, Badge, Chip, Panel, Wordmark, Keyboard)
  components/            DAW regions: TransportBar, Browser, Settings,
                         arrange/* (ruler, tracks, clips, automation, master),
                         devices/* (DeviceChain + reserved VST3 modules)
juce-host/               Native JUCE C++ VST3 host (the audio engine) — see its README
src-tauri/               Tauri shell (web-only/UI dev; superseded by juce-host for audio)
public/fonts/            Self-hosted .woff2 files
design/handoff/          The original design handoff, kept for reference
app-icon.svg             Source icon (regenerate set with `npm run tauri icon app-icon.svg`)
```

## Branching & workflow

- **`main`** — stable releases.
- **`dev`** — default branch; integration target for all feature work.
- Feature branches are cut from `dev` and merged back via pull request.

## Path to a usable DAW

The looks are not the problem. The **UI is complete and well-tested**, and the
**native JUCE engine already does real per-track audio-file mixing** — groups,
sends/returns, insert-FX racks, a master FX chain, parameter automation, and VST3
*effect* hosting all work (`juce-host/Source/AudioEngine.cpp`, `TrackChannel.cpp`,
`GroupBus.h`, `DeviceRack.h`). What's missing is the loop that makes a DAW a DAW:
**record → arrange → play instruments → bounce.** Until that lands, this is best
described as a high-fidelity DAW *prototype*, not a tool you can finish a track in.

There are two delivery targets, and the work below covers both. The **native JUCE
host is the primary product** (the only build that makes real audio); the **browser
build is the demo today and a faster secondary route to "usable"** (real audio in
the browser with no native toolchain). The native gaps are framed as P0.

### What already works

- Full DAW UI + state model (`src/components/**`, `src/store/useDawStore.ts`).
- Native multitrack mixing of **audio files** with groups, sends/returns, inserts,
  master chain, and parameter automation (see the `juce-host/` files above).
- VST3 **effect** hosting incl. editor windows and state save/load
  (`AudioEngine.cpp`: `installPlugin`, `getPluginState`/`setPluginState`, `openEditor`).
- Session save/load + autosave (`src/lib/sessionStore.ts`, `session.ts`, `autosave.ts`).
- Browser audio *simulation*: a toy synth, metronome, metering, virtual mixer
  (`src/lib/audio.ts`, `playback.ts`, `mixerGraph.ts`, `hooks/useTransportLoop.ts`).

### P0 — critical blockers (it is not a DAW without these)

1. **MIDI is silent in the real engine.** No instrument is hosted; every `MidiBuffer`
   is cleared before `processBlock` (`AudioEngine.cpp:818,838`; `TrackChannel.h:93`
   *"empty MIDI for the insert chain"*). The piano roll only makes sound via the
   browser toy synth. → Host a per-track **VST3 instrument** and schedule clip notes
   into it sample-accurately; ship one built-in instrument.
2. **Recording does nothing.** `setRecording` only stores an atomic that is never read;
   there is no `AudioFormatWriter` / disk capture (`AudioEngine.h:46,209`). → arm →
   capture input → write file → create a clip.
3. **The timeline you build is not what plays.** The engine plays one whole audio file
   per track from the playhead (`TrackChannel::loadFile`/`renderInto`, `assignTrackFile`),
   ignoring clip positions, lengths, multiple clips, and all MIDI clips. → a real
   **clip/timeline playback model** (per-clip scheduling, offsets, fades) in the engine.
4. **No audio export / bounce.** `sessionExport` writes the `.zdaw` *project JSON*
   (`EngineController.cpp:340`); there is no offline render. → bounce the arrangement
   (or loop region) to WAV/MP3.

### P1 — needed before anyone could do real work

5. **No undo/redo at all** — no history stack in the store; every edit is permanent.
   → undo/redo over store mutations with the standard Ctrl/Cmd-Z bindings.
6. **The browser never plays real audio files** — no `decodeAudioData`;
   `createBufferSource` is only the drum synth (`src/lib/audio.ts:87`). → decode and
   play real buffers so the browser build previews the engine faithfully.
7. **Audio clips show a fake waveform** (gradient stripes, `arrange/TrackLane.tsx`),
   not real sample peaks. → render real waveform data.
8. **No real MIDI hardware input** — Settings list devices but nothing captures them.
   → open the input, route to the armed instrument (monitor + record), honor MIDI Thru.
9. **The library is hardcoded, non-functional content** (`src/data/seed.ts`) — dropping
   an instrument/FX loads nothing real. → wire real instrument/plugin/sample loading.

### P2 / build & distribution

10. **Plugin device UIs are decorative placeholders** (`devices/ZandersEQ.tsx`,
    `ZandersTapeStop.tsx`); `ZandersPreDrop` is the only wired one. → real in-app
    editors, or rely on native editor windows and drop the mockups.
11. **The native host is hard to run and can't build in the sandbox** — manual CMake
    build plus three externally-built VST3 plugins (`juce-host/README.md`). → streamline
    the build and bundle default built-in instruments/effects so a fresh install makes
    sound immediately.

### Suggested build order

Engine clip/timeline model (1) → VSTi + MIDI scheduling (2) → recording (3) →
bounce/export (4) → undo/redo (5) → real waveforms + browser sample playback (6, 7) →
MIDI input (8) → real library + packaged build with bundled plugins (9, 11).
**Items 1–4 are the line between "demo" and "DAW."**
