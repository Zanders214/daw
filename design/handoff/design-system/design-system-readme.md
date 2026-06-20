# Neon Plugins — Design System

The shared visual language for **Neon Plugins**, makers of the **Zanders** line of audio plugins. One kit drives three products: a dark glass panel, a four-stop spectrum, and a single blue glow accent. Everything is live — knobs drag, sliders scrub, keys play.

> **Namespace:** components are exposed on `window.NeonPluginsDesignSystem_54a692`.
> In any card / kit HTML: `const { Knob, Panel } = window.NeonPluginsDesignSystem_54a692`.

## Sources

This system was reverse-engineered from a set of working Design Components provided by the user, mounted read-only at:

- `Combining neon designs/` — `Neon Audio Design System.dc.html` (the kit overview), `Pre-Drop.dc.html`, `Tape Stop.dc.html`, `Zanders Piano.dc.html`, `Keyboard.dc.html`.

No Figma file, raster assets, brand book, or slide decks were provided. All visuals in the originals are pure CSS/SVG; the system preserves that — there are **no image assets**. The three products were rebuilt here as UI kits composed from extracted primitives.

## The products

| Product | Tagline | Color | What it does |
|---|---|---|---|
| **ZandersPreDrop** | BUILD-UP | pink | One AMOUNT knob ramps a build-up chain (HPF → Reverb → Delay → Riser). |
| **ZandersTapeStop** | WIND-DOWN | cyan | A STOP transport spins virtual reels down along a tape-stop curve. |
| **ZandersPiano** | GRAND | blue accent | A playable concert grand: mic blend, voicing, dynamics, presets. |

---

## CONTENT FUNDAMENTALS

How copy is written across the products. There is almost no prose — this is instrument-panel copy, terse and technical.

- **Voice:** none, really. The UI doesn't address the user. No "you", no "we", no sentences inside the products. Labels are nouns and parameters, not instructions. (Prose only appears in *documentation* like this file, where it's plain and declarative.)
- **Casing:** control labels and mode badges are **ALL CAPS with wide tracking** (`AMOUNT`, `BUILD-UP`, `TAPE SPEED`, `MIC BLEND`). Product names are CamelCase set into the wordmark (`ZandersPreDrop`). Preset names are Title Case (`Concert Grand`, `Felt Intimate`).
- **Values are mono.** Every measured quantity uses JetBrains Mono with its real unit: `1.24 kHz`, `-6.0 dB`, `500 ms`, `74%`, `exp 2.4`, `STEREO 88%`. Percent for normalized params, real units (Hz/kHz, dB, ms/s) for physical ones.
- **State words are short and loud:** `STOP` → `STOPPING`, `SUSTAIN` → `PEDAL DOWN`, `OFF`. Two words max, the engaged label often different from the idle one.
- **Hyphenation:** two-word mode labels use a non-breaking hyphen so they never wrap mid-badge (`BUILD‑UP`, `WIND‑DOWN`).
- **No emoji. No exclamation. No marketing tone.** The only "personality" is the spectrum color and the glow. Iconography is near-zero (see ICONOGRAPHY).
- **Numbers carry the design.** A big numeric readout (the knob center) is the hero element, not a headline. Avoid inventing stats or copy that isn't a real parameter.

Examples lifted from the kit: `AMOUNT 74%`, `tension 62%`, `TYPE IV`, `C2 — C5`, `VIEW PLAYER ⇅`, `exp 2.4`, `0.0 dB`.

---

## VISUAL FOUNDATIONS

### Color
- **The spectrum is the brand.** A four-stop ramp — **cyan `#34d8ff` → violet `#8b7bff` → pink `#ff5fa8` → amber `#ffc24b`** — represents the 0→100% sweep. Every meter, ring, histogram and progress bar runs this ramp left-to-right or low-to-high. Each stop also "owns" an effect band (HPF / Reverb / Delay / Riser).
- **One accent: blue `#5e93ff`.** Badges, active toggles, selection, the MONO checkbox. The engaged toggle fills with a blue→violet gradient.
- **One alarm: red `#ff5a5a` → `#e23b3b`.** The only other chromatic signal — reserved for STOP / engaged-destructive states.
- Everything else is **cool grey on dark glass.** Text runs `#e8ecf3` (primary) down through `#cfd4dc`, `#8a93a3`, `#7e8794` to `#5d6473` (ticks). On-panel structure is built from **white-alpha layers** (5%→12%), never opaque greys.

### Type
- **Space Grotesk** for everything visible: display numerals (tight, `-0.02em`), UI labels, the wordmark. **JetBrains Mono** for every measured value, unit and code-like readout.
- Weight 600 is the workhorse; 700 only on engaged buttons. All-caps labels track wide (`0.14–0.22em`); big numbers track tight.
- No body-copy size inside products — the smallest text is a 8.5px mono caption; the largest is the 38px knob readout.

### Backgrounds & surface
- The product surface is a **dark radial well**: `radial-gradient(120% 80% at 50% -10%, #1a2030, #0a0b12)` — a faint top highlight falling to near-black. No images, no full-bleed photography, no patterns, no noise texture.
- Display areas (cassette window, reel housing) are **deeper inset wells** (`#070a0e`) with inner shadow.
- Documentation/spec surfaces use **warm paper** (`#e7e5df` / white cards) — a deliberate contrast with the product's dark glass.

### Glow (the signature effect)
- Color elements glow in **their own color**, never a generic drop shadow. Two mechanisms:
  - **box-shadow** for dots, buttons, indicators (`0 0 7px <color>` status dot; `0 0 22px <color-alpha>` engaged button).
  - **drop-shadow filter** for rings/arcs, which are *masked conic-gradient donuts* (`drop-shadow(0 0 7px …)`).
- The hero knob's white center indicator glows white with a soft halo ring.

### Borders & shadows
- Borders are **white-alpha hairlines** (`rgba(255,255,255,0.06–0.12)`). The only colored border is the blue accent (selection / active wells).
- Elevation is mostly **inset** (knob faces, display wells use `inset` shadows). There is exactly **one outer drop**: the panel floats on `0 18px 50px rgba(0,0,0,0.4)`. No mid-level card shadows on dark.

### Corner radii
- **Soft on product, sharp on docs.** Product panel = 16px; windows = 12px; buttons = 10–12px; chips = 8px; badges = 20px pill; knobs/dots = full circle. Documentation/spec cards round at **2px** — the contrast is intentional.

### Cards
- There are no "content cards" in the product sense. The closest analogues are **chips** (white/5% fill, 8px radius, glowing dot + label + mono value) and the **panel** itself. Spec/specimen cards (this DS tab) are white, 2px radius, with a faint `0 1px 3px rgba(0,0,0,.08)` shadow.

### Motion
- **Short and mechanical. No bounce.** Button/chip state changes fade over `0.15s`; fills swap over `0.08s`; keys/knobs depress over `0.04s`. Press = a literal `translateY(2px)` down.
- Continuous motion (reels spinning, voicing wobble) is **requestAnimationFrame-driven**, physically modeled (tape slows on an exponential curve), never a looping decorative CSS animation.
- Parameter changes from presets **ease toward targets** (≈8/s lerp), they don't snap.

### Hover / press states
- Idle controls sit on white/5–6% fills. **Active/engaged** = filled color gradient + outer glow + brighter text. **Press** = the 2px depress (keys, buttons). Selection (preset chips) = accent gradient fill + accent glow.

### Layout rules
- Each product is a **fixed-width panel** (360px for the two macros, 900px for the piano). Header row = wordmark + mode badge. Sections are separated by `border-top` hairlines with ~18–20px padding. The piano splits into a 1.25 / 1 two-column body over a full-width keyboard.
- Transparency/blur: used sparingly — white-alpha layering does the work; no backdrop-blur glass effect.

---

## ICONOGRAPHY

**There is almost no iconography, by design.** This is a deliberate foundation, not a gap.

- **No icon font, no SVG icon set, no PNG icons, no emoji.** The originals ship none and neither does this system.
- The only glyphs in use are **two Unicode characters** drawn as type, plus **one inline SVG**:
  - `⇅` (U+21C5, up-down arrow) — the perspective/flip affordance on the piano's VIEW toggle.
  - `—` / `·` (em-dash, middot) — separators in mono captions (`C2 — C5`, `STOP : OFF · exp 2.4`).
  - A hand-drawn **checkmark SVG** inside the MONO checkbox (a 12×12 stroked path) — the single bespoke icon in the whole kit.
- **Status is shown with color, not icons:** glowing dots (chips), filled rings/arcs (dials), histograms (curves). A lit vs. dimmed dot replaces what a lesser UI would do with an icon.
- **If you need an icon** for a new surface: prefer a Unicode glyph set in Space Grotesk or a minimal single-stroke inline SVG (2px stroke, round caps, matching the checkmark). Do **not** introduce an icon library, emoji, or filled/duotone icons — they'd break the panel's restraint. Flag it to the user if a real icon set becomes necessary.

---

## VISUAL ASSETS

None. Every mark, control, and texture is generated from CSS/SVG and the tokens. The **wordmark is type** (`Zanders` + colored product name, no logo file). The **brand "logo" motif** is the 270° masked-donut spectrum sweep ring — reproduced in `guidelines/brand-wordmark.card.html` and as the `Knob` component.

---

## FONTS — substitution note

Both families are loaded from **Google Fonts** (`fonts/fonts.css`): **Space Grotesk** and **JetBrains Mono**. These are the *original* faces from the source files, not substitutes — but they load over the network via `@import url(...)`, so the compiler reports **0 bundled font binaries**. If you need offline/self-hosted fonts, ask the user for the `.woff2` files and we'll add `@font-face` rules. ⚠️ **Open question for the user:** is CDN delivery acceptable, or do you want the fonts self-hosted?

---

## INDEX — what's in this system

**Root**
- `styles.css` — the single entry point consumers link. `@import`s the token + font closure.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skill manifest (for use in Claude Code).
- `CLAUDE.md` — persistent project notes.

**Foundations** (`tokens/`, `fonts/`)
- `tokens/colors.css` — spectrum, accent, danger, surface, white-alpha layers, text scale, doc-chrome neutrals.
- `tokens/typography.css` — families, scale, weights, tracking, leading.
- `tokens/spacing.css` — 4px space scale, radii, control geometry.
- `tokens/effects.css` — shadows, glow, borders, motion.
- `fonts/fonts.css` — Space Grotesk + JetBrains Mono (Google Fonts).

**Components** (`components/`) — exposed on `window.NeonPluginsDesignSystem_54a692`
- `buttons/` — `GlowButton` (accent/danger toggle), `Badge`, `Chip`.
- `controls/` — `Knob` (hero), `Dial`, `Slider`, `Meter`.
- `surfaces/` — `Panel`, `Wordmark`, `Keyboard`.

**UI kits** (`ui_kits/`) — full interactive product faces composed from the primitives
- `predrop/` — ZandersPreDrop.
- `tapestop/` — ZandersTapeStop.
- `piano/` — ZandersPiano.

**Specimen cards** (`guidelines/`) — the foundation cards in the Design System tab (Colors, Type, Spacing, Brand).
