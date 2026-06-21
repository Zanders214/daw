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

## Roadmap

- **Native audio engine + VST3 hosting** — in progress in [`juce-host/`](juce-host/README.md):
  a JUCE C++ host loads the real ZandersEQ / TapeStop / PreDrop `.vst3`s into a
  master FX chain and opens their native editors. Phase 0/1 (master chain + a
  file/input source) is in; Phase 2/3 add per-track audio, automation→params,
  plugin scanning UI, and project save/load.
- Parameter automation is implemented: editable breakpoint envelopes (add /
  delete / drag both axes) on tracks and group buses drive the engine block-
  accurately — track vol/pan/sends, group vol/pan, and hosted device params.
- Drag-from-browser onto lanes; master/return bus automation lanes; an
  arbitrary third-party VST3 browser.
