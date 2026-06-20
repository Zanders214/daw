import type { BrowserCategory, BrowserTab, Group, Track } from "../types";

/** The demo session's tracks (color, routing, type, and clips). */
export const TRACK_DEFS: Track[] = [
  { id: "kick",  name: "KICK",       color: "#34d8ff", io: "A1", type: "drum",  clips: [ { id: "kick-i", bar: 0, len: 16, name: "4-on-floor" }, { id: "kick-drop", bar: 16, len: 16, name: "Drop Kick" } ] },
  { id: "sub",   name: "SUB BASS",   color: "#59c6f5", io: "A1", type: "midi",  clips: [ { id: "sub-d", bar: 16, len: 16, name: "Sub 808" } ] },
  { id: "reese", name: "REESE",      color: "#8b7bff", io: "A2", type: "midi",  clips: [ { id: "reese-d", bar: 16, len: 8, name: "Reese" }, { id: "reese-d2", bar: 24, len: 8, name: "Reese" } ] },
  { id: "pluck", name: "PLUCKS",     color: "#b06fe0", io: "A2", type: "midi",  clips: [ { id: "pl-b", bar: 8, len: 8, name: "Pluck Arp" }, { id: "pl-d", bar: 24, len: 8, name: "Pluck Arp" } ] },
  { id: "lead",  name: "LEAD SYNTH", color: "#ff5fa8", io: "A3", type: "midi",  clips: [ { id: "lead-drop", bar: 16, len: 8, name: "Lead Hook" }, { id: "lead-b", bar: 26, len: 6, name: "Lead B" } ] },
  { id: "vox",   name: "VOX CHOP",   color: "#ff8a7a", io: "A3", type: "audio", clips: [ { id: "vox-b", bar: 8, len: 4, name: "Vox" }, { id: "vox-d", bar: 20, len: 4, name: "Vox Chop" } ] },
  { id: "riser", name: "RISER FX",   color: "#ffc24b", io: "FX", type: "audio", clips: [ { id: "ri-1", bar: 12, len: 4, name: "Riser" }, { id: "ri-2", bar: 28, len: 4, name: "Impact" } ] },
];

/** Track groups (DRUMS / BASS / SYNTHS / VOX & FX). */
export const GROUP_DEFS: Group[] = [
  { id: "g-drums", name: "DRUMS",    color: "#34d8ff", tracks: ["kick"] },
  { id: "g-bass",  name: "BASS",     color: "#8b7bff", tracks: ["sub", "reese"] },
  { id: "g-synth", name: "SYNTHS",   color: "#ff5fa8", tracks: ["pluck", "lead"] },
  { id: "g-fx",    name: "VOX & FX", color: "#ffc24b", tracks: ["vox", "riser"] },
];

/** Per-kind badge colors in the browser. */
export const KIND_COLOR: Record<Exclude<BrowserTab, "all">, string> = {
  inst: "#5e93ff",
  fx: "#34d8ff",
  audio: "#8a93a3",
  midi: "#ff5fa8",
  preset: "#ffc24b",
};

/** The browser library catalog. */
export const LIBRARY: BrowserCategory[] = [
  { name: "INSTRUMENTS", color: "#5e93ff", items: [
    { kind: "inst", glyph: "GP", name: "Zanders Grand Piano" },
    { kind: "inst", glyph: "SS", name: "Supersaw Engine" },
    { kind: "inst", glyph: "RS", name: "Reese Designer" },
    { kind: "inst", glyph: "DR", name: "Drum Rack 909" },
  ] },
  { name: "PLUGINS / FX", color: "#34d8ff", items: [
    { kind: "fx", glyph: "EQ", name: "ZandersEQ" },
    { kind: "fx", glyph: "TS", name: "ZandersTapeStop" },
    { kind: "fx", glyph: "PD", name: "ZandersPreDrop" },
    { kind: "fx", glyph: "CMP", name: "Bus Compressor" },
    { kind: "fx", glyph: "RV", name: "Hall Reverb" },
  ] },
  { name: "DRUM SAMPLES", color: "#34d8ff", items: [
    { kind: "audio", glyph: "K", name: "Analog Kick 04" },
    { kind: "audio", glyph: "C", name: "Clap Layered" },
    { kind: "audio", glyph: "H", name: "Hat Roll 1/16" },
  ] },
  { name: "BASS", color: "#8b7bff", items: [
    { kind: "audio", glyph: "808", name: "Distorted 808" },
    { kind: "midi", glyph: "RB", name: "Reese Bassline" },
  ] },
  { name: "MIDI CLIPS", color: "#ff5fa8", items: [
    { kind: "midi", glyph: "AP", name: "Pluck Arp 124" },
    { kind: "midi", glyph: "CH", name: "Chord Stab" },
    { kind: "midi", glyph: "LD", name: "Lead Hook" },
  ] },
  { name: "FX & RISERS", color: "#ffc24b", items: [
    { kind: "audio", glyph: "↑", name: "Noise Riser 8b" },
    { kind: "audio", glyph: "✷", name: "Impact Hit" },
  ] },
  { name: "PRESETS", color: "#5e93ff", items: [
    { kind: "preset", glyph: "★", name: "PreDrop · 32 Bar Build" },
    { kind: "preset", glyph: "★", name: "EQ · Drop Master" },
  ] },
];

/** Settings dropdown options. */
export const OUTPUT_DEVICES = [
  "Built-in Output",
  "Focusrite Scarlett 2i2",
  "Universal Audio Apollo Twin",
];
export const MIDI_INPUTS = [
  "All MIDI Inputs",
  "Launchkey 49 MK3",
  "Maschine Mk3",
  "None",
];
