# Handoff: Zanders DAW

## Overview
A full digital-audio-workstation (DAW) interface for the **Zanders / Neon Plugins** brand — a dark-glass, neon-spectrum production environment. It contains a transport bar, a searchable browser, a multitrack arrange view (color-coded clips, MIDI note display, automation lanes, track groups, per-track volume), a master bus, a device/plugin chain with reserved slots for the house plugins (EQ, TapeStop, PreDrop), a settings page, and three color themes (dark / light / midnight).

It is a single fixed-size canvas of **1920 × 1080** designed to run full-screen as a desktop app.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look and behavior. They are **not production code to copy directly**.

The HTML prototype is authored as a "Design Component" (a custom in-house format using `<x-dc>`, `{{ }}` template holes, `<sc-for>`/`<sc-if>`, and an `x-import` component loader). **Do not try to reuse that runtime.** Read it as a spec: the markup shows layout and styling, the embedded `class Component` shows state and behavior. Your task is to **recreate this design in the target codebase's environment** (React, Vue, SwiftUI, JUCE/native, etc.) using its established patterns. If no environment exists yet, choose the most appropriate framework. For an actual audio plugin host, the natural target is a native framework such as **JUCE (C++)** or an Electron/web-audio shell — but the visual/UX spec below is framework-agnostic.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are all specified. Recreate the UI pixel-accurately using the values in this README and the design-system token files included under `design-system/`.

---

## Layout (top to bottom)

The root is a 1920×1080 flex column, `overflow:hidden`, `position:relative` (so the settings overlay can cover it). Background = the active theme's `--app-bg`. Three stacked regions:

```
┌───────────────────────────────────────────────────────────────┐
│ TRANSPORT BAR            height 68px, flex:none                 │
├──────────┬────────────────────────────────────────────────────┤
│ BROWSER  │ ARRANGE  (ruler 34 + track rows flex + master 62)   │  ← MIDDLE ROW, flex:1
│ 288px    │                                                     │
├──────────┴────────────────────────────────────────────────────┤
│ DEVICE CHAIN            height 300px (44px collapsed)           │
└───────────────────────────────────────────────────────────────┘
```

The browser can collapse to a 36px vertical rail; the device chain collapses to its 44px header. The arrange's track-header column can be moved to the **left or right** of the lanes (flex `row` / `row-reverse`).

---

## Screens / Views

### 1. Transport Bar (height 68px)
Left → right, `display:flex; align-items:center; gap:22px; padding:0 22px`. Background `var(--app-topbar)`, bottom border `1px solid var(--layer-3)`, shadow `0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.4)`.

- **Brand tile + wordmark** — a 30×30 rounded tile (radius 8, `background:var(--knob-face)`, border `1px var(--layer-5)`, `box-shadow:var(--shadow-knob)`) holding an 11px spectrum-ramp dot. **Clicking the tile opens the Settings page** (cursor:pointer). Next to it: the wordmark "Zanders**Studio**" (Studio in `--spectrum-cyan`).
- **Transport controls** (gap 9): Rewind `⏮` (40×40), **PLAY** toggle (128px wide, primary glow button; label "PLAYING" when engaged), **Stop** (48×48, white square glyph), **REC** toggle (120px, danger/red glow button), **LOOP** toggle (engaged = accent-soft fill + accent glow).
- **Metronome cluster**: a ♩ toggle button (40×40, accent fill when on) + four beat dots. Beat 1 is amber `#ffc24b` (9px), beats 2–4 are accent blue `#5e93ff` (7px); the current beat lights while playing.
- **Readouts** (each a `--well` pill, radius 10, `box-shadow:var(--shadow-window)`): POSITION (`bar.beat.sixteenth`, mono 22px, e.g. `17.1.1`), TEMPO (mono 22px in `--spectrum-cyan`, e.g. `124 BPM`), SIG (`4/4`).
- **Master meter** (right): label row "MASTER" + dB readout, a horizontal spectrum Meter (200px, height 7), and a 42px round monitor knob reading `0.0`.

### 2. Browser (width 288px, collapsible)
Column, `background:var(--app-surface)`, right border `1px var(--layer-3)`.
- **Header** (`background:var(--app-surface-2)`): "BROWSER" label + a `«` collapse button (24×24). Below it a **search field** (34px, `--well` fill, `⌕` glyph + text input, placeholder "Search instruments, FX, MIDI…"). Below that a row of **filter tabs**: ALL / INST / FX / AUDIO / MIDI / PRESET (active = accent-soft fill + accent border).
- **List** (scroll): categories (INSTRUMENTS, PLUGINS / FX, DRUM SAMPLES, BASS, MIDI CLIPS, FX & RISERS, PRESETS). Each category = a glowing color dot + name + count. Each item row = a 26×26 monogram tile (category-colored, `hexA(color,0.12)` fill), the item name, and a small kind badge (INST/FX/AUDIO/MIDI/PRESET, colored per kind). Items are filtered live by the active tab AND the search query; an empty result shows "No matches".
- **Collapsed rail** (36px): a `»` glyph + vertical "BROWSER" text; click to reopen.

Kind colors: `inst #5e93ff`, `fx #34d8ff`, `audio #8a93a3`, `midi #ff5fa8`, `preset #ffc24b`.

### 3. Arrange (flex:1)
Column: ruler (34px) → track rows (scroll, flex:1) → master bar (62px). Background `var(--app-arrange)`.

**Ruler (34px)** — a 258px label cell ("TRACKS" + a `⇆` button that flips the track column to the other side) followed by 32 bar cells (major gridline every 4 bars, mono bar numbers). A white playhead triangle marker sits at the play position.

**Track-header column (258px wide)** + **lanes (flex:1)** scroll together. The content is an interleaved list of **group headers** and **track rows**:

- **Group header (34px)** — `background:hexA(groupColor,0.10)`, `border-left:2px solid groupColor`. Contains: a `▾`/`▸` collapse chevron (20×20), a 9px group color square, the group name (11px, 700, tracking 0.1em), a track count ("2 TRK"), and **M / S** buttons (24×22) that mute/solo every track in the group at once. Collapsing hides the group's track rows. In the lanes column a group renders as a thin tinted bar (`hexA(groupColor,0.05)`, 34px).
  - Groups: **DRUMS** `#34d8ff` (kick) · **BASS** `#8b7bff` (sub, reese) · **SYNTHS** `#ff5fa8` (pluck, lead) · **VOX & FX** `#ffc24b` (vox, riser).
- **Track header (108px)** — three rows:
  1. A glowing color **dot** (11px, radius 3; **click = mute/unmute**, dims to opacity 0.3 + drops glow when muted), the track name (13px, 600), and an I/O tag (mono, e.g. "A1").
  2. **M** (mute), **S** (solo), **●** (record-arm, red when armed), **A** (automation toggle), then a thin spectrum level **Meter** (height 5). Each button is 34×34, radius 8.
  3. **VOL** label + a horizontal volume **Slider** (DS Slider) + a mono dB readout (e.g. `-1.9 dB`). The volume scales the track's playback level/meter; `0 dB` at value 1.0, `20·log10(value)` below.
  - Selected track = accent-tinted header + 2px accent left border. **Double-clicking a track header opens its device chain** (selects it + opens the device rack).
- **Track lane (108px)** — optional bar/beat grid (toggleable). Clips are absolutely positioned by bar: `left = clipBar/32 * 100%`, `width = clipLen/32 * 100%`, inset 7px top/bottom, radius 6, a `linear-gradient` fill in the track color (alpha ~0.17, or ~0.30 in "vibrant" mode) with a 3px solid color left edge. Selected clip = full color ring + outer glow. Clip label sits top-left in the track color.
  - **MIDI tracks** (drum/midi type) render their **notes** inside the clip as a mini piano-roll (small color bars positioned by time × pitch row, 8 rows). **Audio tracks** (vox, riser) render a waveform texture (repeating vertical gradient, masked to fade upward) instead.
- **Automation lane (64px, per track, toggled by the "A" button)** — header side: "AUTO" + parameter chips **VOL / PAN / FILT** (active = accent) + a live value readout in the track color at the playhead. Lane side: a breakpoint **envelope** drawn as an SVG polyline in the track color over a `hexA(trackColor,0.04)` field, with **draggable round breakpoints** (drag vertically to change value, `ns-resize`). Value formatting: VOL/FILT as `%`/`Hz`, PAN as `L##`/`C`/`R##`.

**Playhead** — a 2px white vertical line with white glow spanning the full lanes height; advances at `bpm/60` beats per second when playing, wrapping at 128 beats (32 bars). A faint loop region tint spans the timeline when LOOP is on.

**Master bar (62px)** — at the bottom of the arrange. Header side (258px, click to open master chain): a blue **MASTER** label, a **CHAIN ▸** button, DIM / MONO chips, and "−14 LUFS". Main side: a "MASTER OUT" spectrum Meter (height 9) + dB, and **EQ · LIMITER** device dots. Selecting it loads "MASTER BUS" into the device chain.

### 4. Device Chain / Plugin Rack (height 300px, collapsible)
- **Header (42px)**: "DEVICE CHAIN" label, a pill showing the selected track (color dot + name), "signal flows left → right", a device count, and a `▾`/`▸` collapse chevron.
- **Body** (horizontal scroll, gap 16, padding 18/22): a row of **device modules** (each 340px wide, `background:var(--panel)`, radius 14, border `1px var(--layer-3)`, drop shadow; dimmed to 0.5 opacity when bypassed). Each module has a header (wordmark + **VST3** badge + a round bypass power button) and a 118px display well, plus a mono filename caption.
  - **ZandersEQ** — well shows an SVG frequency-response curve (spectrum gradient stroke) with two draggable-looking band nodes. Caption `ZandersEQ.vst3`, "4 BANDS".
  - **ZandersTapeStop** — well shows two spinning reels (rAF rotation while playing) connected by a tape line. Caption `ZandersTapeStop.vst3`, "WIND-DOWN".
  - **ZandersPreDrop** — well shows a small AMOUNT **Dial** (size 30px) + a list of effect chips (HPF / REV / DLY / RIS) whose values track the dial. Caption `ZandersPreDrop.vst3`, "BUILD-UP".
  - **Add-device slot** — a 200px dashed placeholder ("+ ADD DEVICE / drop .vst3").

> **Reserved plugin slots:** the EQ, TapeStop, and PreDrop modules are placeholders where the real Zanders VST3 plugin UIs will mount. In a native host these become the plugin editor views; in a web/Electron shell they'd be separate embedded components. Keep their card geometry (340×~300 with header/well/caption) as the docking frame.

### 5. Settings (modal overlay)
Opened by clicking the brand tile. A centered dark-glass panel (760px wide, max-height 86%, `background:var(--panel)`, radius 16) over a `rgba(0,0,0,0.55)` blurred backdrop (click backdrop or ✕ to close). Header = ⚙ tile + "Settings" + "Zanders Studio · session preferences". Scrollable body of labeled rows (label + description on the left, control on the right; rows divided by `1px var(--layer-2)`):
- **APPEARANCE** — Theme (segmented DARK / LIGHT / MIDNIGHT), Track list side (LEFT / RIGHT), Show grid (switch), Spectrum clips (switch).
- **AUDIO ENGINE** — Output device (select), Sample rate (44.1 / 48 / 96 kHz segmented), Buffer size (64 / 128 / 256 / 512 segmented), Round-trip latency (computed readout = `bufferSize / (sampleRate·1000) · 2000` ms, in `--spectrum-cyan`).
- **MIDI** — Input device (select), MIDI thru (switch).
- **RECORDING** — Metronome (switch, shared with the transport ♩), Count-in (OFF / 1 BAR / 2 BARS), Auto-save (switch).

Switch control = a 44×24 pill, accent-grad fill + glow when on, 18px white knob sliding 2→21px. Segmented control = small pill buttons, active = accent-soft fill + accent border.

---

## Themes
Three themes are implemented as CSS-variable overrides on the root (`data-theme="dark|light|midnight"`). The product surfaces use an **app layer** of variables (`--app-bg`, `--app-topbar`, `--app-surface`, `--app-surface-2`, `--app-arrange`, `--app-ruler`, `--app-trackhead`); light mode additionally overrides the design-system text/layer/well/panel tokens for a bright treatment. The spectrum, accent, and danger colors stay constant across themes (they are the brand).

- **dark** (default): `--app-bg: radial-gradient(140% 90% at 50% -20%, #11151f, #07080d)`, topbar `linear-gradient(180deg,#11151f,#0b0e15)`, surface `linear-gradient(180deg,#0c0f17,#090b11)`, ruler `#0a0d14`, track-head `#090c12`.
- **light**: bg `radial-gradient(…, #f6f8fc, #e2e7f0)`, topbar `…#ffffff,#eef1f6`, surface `…#f8fafc,#eef1f6`, ruler/track-head `#eef1f6`/`#f1f4f9`; text `#1b2230 / #3c4453 / #646c7b`, panel `#fff`, well `#eaeef4`, layers become `rgba(20,28,46,…)`.
- **midnight**: near-black bg `radial-gradient(…, #0a0c14, #000)`, surfaces `#070910`/`#06070d`/`#050609` — keeps the dark text tokens.

(The full per-theme variable blocks are in the `<style>` of `Zanders DAW.dc.html`.)

---

## Interactions & Behavior
- **Transport**: PLAY advances the playhead at `bpm/60` beats/s (rAF loop), wrapping at 128 beats. STOP resets to 0; Rewind → 0. REC and LOOP are toggles.
- **Metronome**: when on AND playing, emits a Web Audio click each beat (downbeat 1600 Hz, others 1000 Hz, ~50 ms decay) and lights the corresponding beat dot. One state shared between the transport ♩ and Settings.
- **Track levels** are simulated: while playing, each audible track with a clip under the playhead gets a randomized meter level, scaled by its volume; the master meter follows the peak. In production these come from real audio metering.
- **Mute/Solo/Arm**: per track and per group. Solo on any track dims all non-soloed tracks. The color dot is a mute shortcut.
- **Volume**: per-track Slider 0–1 → gain; affects metered level; dB readout `20·log10(v)`.
- **Groups**: collapse/expand (chevron), group M/S apply to all member tracks.
- **Automation**: "A" expands a per-track lane; parameter chips switch the envelope; breakpoints drag vertically (mouse) and persist per track+parameter; a live value reads out at the playhead. (Extension points: horizontal re-timing, add/delete points, plugin-parameter targets, driving the actual value.)
- **Device chain**: per-device bypass (power dot dims the module); double-click a track or click the master cell to load that target's chain.
- **Browser**: tab + text filtering; items are intended to be draggable onto lanes (not yet wired).
- **Settings**: opens from the brand tile; all appearance controls drive the live workspace; backdrop/✕ closes.
- **Motion**: short and mechanical — `--ease: cubic-bezier(0.4,0,0.2,1)`, durations `--dur-press .04s` / `--dur-fast .08s` / `--dur-base .15s`. No bounce. Continuous motion (reels, playhead) is rAF-driven.

## State Management
Top-level UI state (from the prototype's `Component` class):
- `playing, recording, loop, playhead` (beats, 0–128), `bpm`
- `selTrack` (track id or `"master"`), `selClip`
- `mutes{}, solos{}, arms{}` (by track id), `volumes{}` (0–1, default 0.8)
- `groupCollapsed{}` (by group id)
- `devices{eq,tape,pre}` (bypass booleans), `preAmount` (0–1)
- `browserOpen, rackOpen, query, tab`
- `tracksRight` (track column side), `showGrid, vibrantClips`
- `theme` (`dark|light|midnight`)
- `settingsOpen`, plus settings values: `sampleRate, bufferSize, outputDevice, midiInput, midiThru, metronome, countIn, autoSave`
- Automation: `autoLanes{}` (open per track), `autoParam{}` (selected param per track), `autoData{ "trackId:param": [{t,v}…] }` (edited envelopes; defaults generated deterministically)

Data model: **tracks** have `{id, name, color, io, type:'drum'|'midi'|'audio', clips:[{id,bar,len,name}]}`; **groups** have `{id, name, color, tracks:[trackId…]}`. Timeline = 32 bars / 128 beats.

## Design Tokens
All tokens are in `design-system/tokens/*.css`. Key values:

**Spectrum** (the brand ramp, 0→100%): cyan `#34d8ff` → violet `#8b7bff` → pink `#ff5fa8` → amber `#ffc24b`.
**Accent**: `#5e93ff` (soft `rgba(94,147,255,0.12)`, line `0.30`, glow `0.45`, grad `linear-gradient(180deg,#5e93ff,#8b7bff)`).
**Danger**: `#ff5a5a`→`#e23b3b`, glow `rgba(255,80,80,0.5)`.
**Surface**: panel `radial-gradient(120% 80% at 50% -10%, #1a2030, #0a0b12)`, well `#070a0e`, knob-face `radial-gradient(circle at 40% 30%, #222731, #0b0d12)`.
**White-alpha layers** (dark): `--layer-1 .05` / `-2 .06` / `-3 .08` / `-4 .10` / `-5 .12`.
**Text** (dark): `#fff / #e8ecf3 / #cfd4dc / #9aa3b3 / #8a93a3 / #7e8794 / #5d6473` (bright→faint).
**Shadows**: panel `0 18px 50px rgba(0,0,0,.4)`, window `inset 0 2px 10px rgba(0,0,0,.7)`, knob `inset 0 2px 12px rgba(0,0,0,.7), 0 8px 22px rgba(0,0,0,.5)`, inset-top `inset 0 1px 0 rgba(255,255,255,.06)`.
**Radii**: panel 16, window/module 12–14, button 8–10, chip 6–8, badge pill 20, knobs/dots full circle.
**Motion**: ease `cubic-bezier(0.4,0,0.2,1)`; durations `.04 / .08 / .12 / .15s`; press = `translateY(2px)`.

**Typography**: **Space Grotesk** for all display/UI/labels (weight 600 workhorse, 700 on engaged buttons; all-caps labels track 0.14–0.22em). **JetBrains Mono** for every measured value/unit/readout. Both load from Google Fonts (`design-system/fonts.css`). Smallest text ~8.5px mono caption; biggest the readouts at 22px. No body copy.

## Assets
**None.** Every control, meter, waveform, reel, EQ curve, and icon is generated from CSS/SVG + tokens — there are no raster images. The only glyphs are Unicode (`⏮ ♩ ⚙ ⇆ « » ▾ ▸ ⌕ ✕ ●`) set in the UI fonts. The wordmark is type, not a logo file. The brand motif is the 270° masked-donut spectrum ring (the Knob/Dial component).

## Files
- `Zanders DAW.dc.html` — the complete prototype (markup = layout/styling; the embedded `class Component` = state + behavior). Read both halves.
- `design-system/tokens/colors.css · typography.css · spacing.css · effects.css` — design tokens (source of truth for all values above).
- `design-system/fonts.css` — Space Grotesk + JetBrains Mono (Google Fonts).
- `design-system/design-system-readme.md` — the full Neon Plugins design-system guide (voice, color, glow, motion, component inventory).
- `design-system/components/` — reference React (.jsx) + TypeScript types + prompt notes for the kit primitives: `Knob`, `Dial`, `Slider`, `Meter` (controls); `GlowButton`, `Badge`, `Chip` (buttons); `Panel`, `Wordmark`, `Keyboard` (surfaces). Recreate these in your codebase's component style; the DAW composes them throughout (Dial in PreDrop, Slider for track volume, Meter for levels, GlowButton for PLAY/REC, Wordmark/Badge in device headers).
