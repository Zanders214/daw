# Zanders DAW — JUCE host (the audio engine)

This is the **native desktop host** that turns the Zanders DAW UI into a real
VST3 host. It renders the existing React UI inside a `juce::WebBrowserComponent`
and runs a C++ audio engine that loads and processes the Zanders plugins
(ZandersEQ → ZandersTapeStop → ZandersPreDrop) in a master FX chain — like
importing plugins in a DAW. The plugins keep their **own native GUIs** (opened
in separate windows).

> Status: **Phase 0 + 1** (see the repo's plan). Audio flows through a master
> chain fed by a chosen audio **file** or the hardware **input**; per-track
> multitrack audio is a later phase. This code is authored but compiled by you
> (it can't be built in the cloud sandbox).

## Prerequisites
- **CMake ≥ 3.22** and a C++17 toolchain:
  - **macOS:** Xcode + command-line tools.
  - **Windows:** Visual Studio 2022 (Desktop C++); the **WebView2 runtime**
    (ships with Win 11 / recent Win 10).
  - **Linux (optional):** `libwebkit2gtk-4.1-dev`, ALSA/JACK dev packages.
- **Node 18+** (to build the web UI).
- The three plugin **`.vst3`** files — build each repo (`Zanders214/eq`,
  `pre-drop`, `tape-stop`) with its own CMake, or download them from each repo's
  GitHub Actions artifacts, and install to your VST3 folder (or locate them
  in-app, see below).

## Build & run

```bash
# 1) Build the web UI (from the repo root)
npm install
npm run build            # produces ../dist, bundled by the host in Release

# 2) Configure + build the host (from this juce-host/ dir)
cmake -B build -DCMAKE_BUILD_TYPE=Release          # add -DJUCE_PATH=/path/to/JUCE to use a local JUCE
cmake --build build --config Release
# Run the app:
#   macOS:   ./build/ZandersDAW_artefacts/Release/Zanders DAW.app
#   Windows: build\ZandersDAW_artefacts\Release\Zanders DAW.exe
```

### Fast UI iteration (hot reload)
Run the Vite dev server and build the host in **Debug** — it loads
`http://localhost:1420`, so UI edits hot-reload without recompiling C++:

```bash
npm run dev                      # terminal 1 (repo root)
cmake -B build -DCMAKE_BUILD_TYPE=Debug && cmake --build build   # terminal 2
```

## Loading the plugins
On launch the host scans the default VST3/AU locations and auto-assigns any
plugin whose name matches a slot (`ZandersEQ`, `ZandersTapeStop`,
`ZandersPreDrop`). Assignments persist to
`~/.config/ZandersDAW/plugins.json` (or the platform equivalent). If a plugin
isn't found, the UI can call `pluginsPickFile(slot)` to locate the `.vst3`.

To hear audio in Phase 1, choose a source (an audio file via `sourcePickFile`,
or switch to the hardware input via `sourceSetInputMode("input")`), then press
**Play**. Double-click a device's display to open that plugin's native editor.

## How the bridge works
- **JS → C++:** every UI action is a native function (e.g. `transportSetPlaying`,
  `deviceSetBypass`, `deviceOpenEditor`, `deviceSetParam`) registered in
  `Source/WebUI.cpp` and dispatched by `EngineController::handle`. Names match
  `src/lib/engine.ts`.
- **C++ → JS:** `EngineController` emits `engineState` (~30 Hz: playhead, master
  meter, tape-reel angle) and `enginePlugins` (slot load status), consumed by
  `src/hooks/useEngineBridge.ts`.

## Notes
- JUCE 8 is **AGPLv3 or commercial** — choose a license appropriate to how you
  distribute this app.
- The audio callback uses a try-lock around the plugin chain so loading a plugin
  never blocks audio; this is fine for an MVP.
