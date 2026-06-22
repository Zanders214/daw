import { beforeEach, describe, expect, it } from "vitest";
import { useDawStore } from "./useDawStore";
import { DEFAULT_VOLUME, PITCH_MAX, PITCH_MIN, TOTAL_BEATS } from "../lib/constants";
import { serializeSession } from "../lib/session";

// The store is a singleton created at import time. Capture its pristine state
// once and restore it before each test so cases don't bleed into one another.
// Actions never mutate nested state in place (they always spread), so a shallow
// snapshot is a safe reset target.
const pristine = { ...useDawStore.getState() };
const get = () => useDawStore.getState();

beforeEach(() => {
  useDawStore.setState(pristine, true);
});

describe("useDawStore — initial state", () => {
  it("has the documented defaults", () => {
    const s = get();
    expect(s.playing).toBe(false);
    expect(s.loop).toBe(true);
    expect(s.playhead).toBe(64);
    expect(s.bpm).toBe(124);
    expect(s.masterVolume).toBe(1);
    expect(s.masterPan).toBe(0.5);
    expect(s.loopEnd).toBe(TOTAL_BEATS);
    expect(s.devices).toEqual({ eq: true, tape: false, pre: true });
    expect(s.currentSessionName).toBeNull();
  });
});

describe("useDawStore — transport", () => {
  it("togglePlay flips playing", () => {
    expect(get().playing).toBe(false);
    get().togglePlay();
    expect(get().playing).toBe(true);
    get().togglePlay();
    expect(get().playing).toBe(false);
  });

  it("stop clears playing and rewinds the playhead", () => {
    useDawStore.setState({ playing: true, playhead: 40 });
    get().stop();
    expect(get().playing).toBe(false);
    expect(get().playhead).toBe(0);
  });

  it("rewind moves the playhead to 0 without changing play state", () => {
    useDawStore.setState({ playing: true, playhead: 40 });
    get().rewind();
    expect(get().playhead).toBe(0);
    expect(get().playing).toBe(true);
  });

  it("setPlayhead seeks and clamps to the timeline", () => {
    get().setPlayhead(42);
    expect(get().playhead).toBe(42);
    get().setPlayhead(-10);
    expect(get().playhead).toBe(0);
    get().setPlayhead(9999);
    expect(get().playhead).toBe(128); // TOTAL_BEATS
  });

  it("toggleRecord and toggleLoop flip their flags", () => {
    get().toggleRecord();
    expect(get().recording).toBe(true);
    get().toggleLoop();
    expect(get().loop).toBe(false);
  });

  it("setBpm rounds and clamps to a 20 floor", () => {
    get().setBpm(124.6);
    expect(get().bpm).toBe(125);
    get().setBpm(5);
    expect(get().bpm).toBe(20);
  });

  it("setLoopStart / setLoopEnd store the raw values", () => {
    get().setLoopStart(8);
    get().setLoopEnd(96);
    expect(get().loopStart).toBe(8);
    expect(get().loopEnd).toBe(96);
  });
});

describe("useDawStore — selection & per-track mix", () => {
  it("selectTrack and selectClip update selection", () => {
    get().selectTrack("bass");
    expect(get().selTrack).toBe("bass");
    get().selectClip("clip-1", "lead");
    expect(get().selClip).toBe("clip-1");
    expect(get().selTrack).toBe("lead");
  });

  it("toggleMute / toggleSolo / toggleArm toggle per-id booleans", () => {
    get().toggleMute("kick");
    expect(get().mutes.kick).toBe(true);
    get().toggleMute("kick");
    expect(get().mutes.kick).toBe(false);

    get().toggleSolo("snare");
    expect(get().solos.snare).toBe(true);

    // `arms` seeds kick:true, so the first toggle turns it off.
    expect(get().arms.kick).toBe(true);
    get().toggleArm("kick");
    expect(get().arms.kick).toBe(false);
  });

  it("setVolume / setPan write per-track values", () => {
    get().setVolume("lead", 0.3);
    get().setPan("lead", 0.9);
    expect(get().volumes.lead).toBe(0.3);
    expect(get().pans.lead).toBe(0.9);
  });

  it("clearTrackFile marks a track unloaded; setEngineTracks replaces the map", () => {
    get().clearTrackFile("lead");
    expect(get().trackFiles.lead).toEqual({ loaded: false });

    const infos = { bass: { loaded: true, name: "bass.wav", path: "/x/bass.wav" } };
    get().setEngineTracks(infos);
    expect(get().trackFiles).toEqual(infos);
  });

  it("pickTrackFile / assignTrackFile are no-ops without an engine", () => {
    expect(() => get().pickTrackFile("lead")).not.toThrow();
    expect(() => get().assignTrackFile("lead", "/x/y.wav")).not.toThrow();
  });

  it("setMasterVolume / setMasterPan write master values", () => {
    get().setMasterVolume(0.42);
    get().setMasterPan(0.1);
    expect(get().masterVolume).toBe(0.42);
    expect(get().masterPan).toBe(0.1);
  });
});

describe("useDawStore — groups, sends & returns", () => {
  it("toggleGroup collapses/expands", () => {
    get().toggleGroup("g-drums");
    expect(get().groupCollapsed["g-drums"]).toBe(true);
    get().toggleGroup("g-drums");
    expect(get().groupCollapsed["g-drums"]).toBe(false);
  });

  it("group mute/solo/volume/pan setters", () => {
    get().toggleGroupMute("g-drums");
    expect(get().groupMutes["g-drums"]).toBe(true);
    get().toggleGroupSolo("g-drums");
    expect(get().groupSolos["g-drums"]).toBe(true);
    get().setGroupVolume("g-drums", 0.7);
    expect(get().groupVolumes["g-drums"]).toBe(0.7);
    get().setGroupPan("g-drums", 0.2);
    expect(get().groupPans["g-drums"]).toBe(0.2);
  });

  it("setSend creates a [0,0] pair then writes the indexed slot", () => {
    get().setSend("lead", 1, 0.5);
    expect(get().sends.lead).toEqual([0, 0.5]);
    get().setSend("lead", 0, 0.25);
    expect(get().sends.lead).toEqual([0.25, 0.5]);
  });

  it("setReturnGain writes one return without disturbing the other", () => {
    get().setReturnGain(0, 0.6);
    expect(get().returnGains).toEqual([0.6, 1]);
    get().setReturnGain(1, 0.2);
    expect(get().returnGains).toEqual([0.6, 0.2]);
  });

  it("toggleSendsRow flips the per-track expand flag", () => {
    get().toggleSendsRow("lead");
    expect(get().sendsOpen.lead).toBe(true);
  });
});

describe("useDawStore — device rack & browser", () => {
  it("toggleDevice flips the enabled flag", () => {
    expect(get().devices.tape).toBe(false);
    get().toggleDevice("tape");
    expect(get().devices.tape).toBe(true);
  });

  it("setPreAmount stores the drive value", () => {
    get().setPreAmount(0.33);
    expect(get().preAmount).toBe(0.33);
  });

  it("browser search / tab / panel toggles", () => {
    get().onSearch("kick");
    expect(get().query).toBe("kick");
    get().setTab("fx");
    expect(get().tab).toBe("fx");
    const wasOpen = get().browserOpen;
    get().toggleBrowser();
    expect(get().browserOpen).toBe(!wasOpen);
    const rackWas = get().rackOpen;
    get().toggleRack();
    expect(get().rackOpen).toBe(!rackWas);
  });
});

describe("useDawStore — appearance", () => {
  it("setTheme and cycleTheme (wrapping dark→light→midnight→dark)", () => {
    get().setTheme("light");
    expect(get().theme).toBe("light");
    get().setTheme("dark");
    get().cycleTheme();
    expect(get().theme).toBe("light");
    get().cycleTheme();
    expect(get().theme).toBe("midnight");
    get().cycleTheme();
    expect(get().theme).toBe("dark");
  });

  it("workspace toggles", () => {
    get().setTracksRight(true);
    expect(get().tracksRight).toBe(true);
    get().toggleTracksSide();
    expect(get().tracksRight).toBe(false);
    const grid = get().showGrid;
    get().toggleGrid();
    expect(get().showGrid).toBe(!grid);
    const vib = get().vibrantClips;
    get().toggleVibrant();
    expect(get().vibrantClips).toBe(!vib);
  });
});

describe("useDawStore — chain openers & modals", () => {
  it("openTrackChain / openMasterChain / openGroupChain / openReturnChain select + open the rack", () => {
    useDawStore.setState({ rackOpen: false });
    get().openTrackChain("bass");
    expect(get().selTrack).toBe("bass");
    expect(get().rackOpen).toBe(true);

    get().openMasterChain();
    expect(get().selTrack).toBe("master");

    get().openGroupChain("g-drums");
    expect(get().selTrack).toBe("g-drums");

    get().openReturnChain(1);
    expect(get().selTrack).toBe("return-1");
  });

  it("settings & sessions modal open/close", () => {
    get().openSettings();
    expect(get().settingsOpen).toBe(true);
    get().closeSettings();
    expect(get().settingsOpen).toBe(false);
    get().openSessions();
    expect(get().sessionsOpen).toBe(true);
    get().closeSessions();
    expect(get().sessionsOpen).toBe(false);
  });

  it("node-device actions mutate the store (engine inactive)", () => {
    const id = get().addNodeDevice("lead", { kind: "eq", name: "EQ" });
    expect(get().nodeRacks.lead).toEqual([{ id, kind: "eq", name: "EQ", bypassed: false, path: undefined }]);
    get().setNodeDeviceBypass("lead", id, true);
    expect(get().nodeRacks.lead[0].bypassed).toBe(true);
    get().removeNodeDevice("lead", id);
    expect(get().nodeRacks.lead).toBeUndefined();
    expect(() => get().openNodeEditor("lead", id)).not.toThrow();
    const racks = { lead: [{ id: "d1", kind: "eq" as const, name: "EQ", bypassed: false }] };
    get().setNodeRacks(racks);
    expect(get().nodeRacks).toEqual(racks);
  });

  it("track add/remove mutate the arrangement and prune per-track state", () => {
    const before = get().tracks.length;
    const id = get().addTrack({ name: "BD", type: "drum", group: "g-drums" });
    expect(get().tracks.some((t) => t.id === id)).toBe(true);
    expect(get().groups.find((g) => g.id === "g-drums")?.tracks).toContain(id);
    get().setVolume(id, 0.5);
    get().addNodeDevice(id, { kind: "eq", name: "EQ" });
    get().removeTrack(id);
    expect(get().tracks.length).toBe(before);
    expect(get().volumes[id]).toBeUndefined();
    expect(get().nodeRacks[id]).toBeUndefined();
    expect(get().groups.find((g) => g.id === "g-drums")?.tracks).not.toContain(id);
  });

  it("ungrouped new tracks land in the implicit TRACKS group", () => {
    const id = get().addTrack();
    expect(get().groups.find((g) => g.id === "g-tracks")?.tracks).toContain(id);
  });

  it("clip move/resize/region clamp to the grid", () => {
    const tid = get().addTrack();
    get().addClip(tid, { id: "c1", bar: 4, len: 8, name: "X" });
    const clip = () => get().tracks.find((t) => t.id === tid)!.clips.find((c) => c.id === "c1")!;

    get().moveClip(tid, "c1", 10);
    expect(clip().bar).toBe(10);
    get().moveClip(tid, "c1", -5);              // clamp to >= 0
    expect(clip().bar).toBe(0);
    get().moveClip(tid, "c1", 999);             // clamp so bar+len stays on the 32-bar grid
    expect(clip().bar).toBe(32 - 8);

    get().resizeClip(tid, "c1", 0);             // clamp to the minimum length
    expect(clip().len).toBeGreaterThan(0);
    get().moveClip(tid, "c1", 0);
    get().resizeClip(tid, "c1", 999);           // clamp to the grid edge
    expect(clip().len).toBe(32);

    get().setClipRegion(tid, "c1", 6, 4);       // left-edge resize sets both jointly
    expect(clip()).toMatchObject({ bar: 6, len: 4 });
  });

  it("clip remove clears selection; duplicate places + selects a copy", () => {
    const tid = get().addTrack();
    get().addClip(tid, { id: "c1", bar: 0, len: 4, name: "Loop" });
    get().selectClip("c1", tid);

    get().duplicateClip(tid, "c1");
    const clips = () => get().tracks.find((t) => t.id === tid)!.clips;
    expect(clips()).toHaveLength(2);
    const copy = clips().find((c) => c.id !== "c1")!;
    expect(copy.bar).toBe(4);                    // placed right after the original
    expect(copy.name).toBe("Loop");
    expect(get().selClip).toBe(copy.id);         // copy becomes selected

    get().selectClip("c1", tid);
    get().removeClip(tid, "c1");
    expect(clips().some((c) => c.id === "c1")).toBe(false);
    expect(get().selClip).toBe("");              // removing the selected clip clears it
  });
});

describe("useDawStore — audio/MIDI settings", () => {
  it("setSampleRate / setBufferSize / setOutputDevice store values (engine inactive)", () => {
    get().setSampleRate(44.1);
    expect(get().sampleRate).toBe(44.1);
    get().setBufferSize(512);
    expect(get().bufferSize).toBe(512);
    get().setOutputDevice("Speakers");
    expect(get().outputDevice).toBe("Speakers");
  });

  it("refreshDevices is a no-op without an engine", () => {
    expect(() => get().refreshDevices()).not.toThrow();
  });

  it("setDeviceInfo converts Hz→kHz and maps available lists", () => {
    get().setDeviceInfo({
      outputDevice: "Iface",
      sampleRate: 48000,
      bufferSize: 128,
      sampleRates: [44100, 48000, 96000],
      bufferSizes: [128, 256],
      outputs: ["A", "B"],
    });
    const s = get();
    expect(s.outputDevice).toBe("Iface");
    expect(s.sampleRate).toBe(48);
    expect(s.bufferSize).toBe(128);
    expect(s.availableSampleRates).toEqual([44.1, 48, 96]);
    expect(s.availableBufferSizes).toEqual([128, 256]);
    expect(s.availableOutputs).toEqual(["A", "B"]);
  });

  it("MIDI + misc setting toggles", () => {
    get().setMidiInput("Port 1");
    expect(get().midiInput).toBe("Port 1");
    const thru = get().midiThru;
    get().toggleMidiThru();
    expect(get().midiThru).toBe(!thru);
    const metro = get().metronome;
    get().toggleMetronome();
    expect(get().metronome).toBe(!metro);
    get().setCountIn(2);
    expect(get().countIn).toBe(2);
    const auto = get().autoSave;
    get().toggleAutoSave();
    expect(get().autoSave).toBe(!auto);
  });
});

describe("useDawStore — automation editing", () => {
  it("toggleAuto flips a lane and setAutoParam stores the param", () => {
    get().toggleAuto("lead");
    expect(get().autoLanes.lead).toBe(true);
    get().toggleAuto("lead");
    expect(get().autoLanes.lead).toBe(false);
    get().setAutoParam("lead", "pan");
    expect(get().autoParam.lead).toBe("pan");
  });

  it("addAutoPoint materializes the default curve and keeps points sorted by time", () => {
    get().addAutoPoint("lead", "vol", { t: 10, v: 0.9 });
    const pts = get().autoData["lead:vol"];
    // default curve is 5 points; the new one makes 6, still ascending in t.
    expect(pts).toHaveLength(6);
    expect(pts.some((p) => p.t === 10 && p.v === 0.9)).toBe(true);
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThanOrEqual(pts[i - 1].t);
  });

  it("setAutoPoints replaces the whole envelope", () => {
    const env = [
      { t: 0, v: 0.2 },
      { t: 64, v: 0.8 },
    ];
    get().setAutoPoints("lead", "vol", env);
    expect(get().autoData["lead:vol"]).toEqual(env);
  });

  it("moveAutoPoint replaces in place and ignores out-of-range indices", () => {
    get().setAutoPoints("lead", "vol", [
      { t: 0, v: 0.2 },
      { t: 32, v: 0.5 },
    ]);
    get().moveAutoPoint("lead", "vol", 1, { t: 40, v: 0.6 });
    expect(get().autoData["lead:vol"][1]).toEqual({ t: 40, v: 0.6 });

    const before = get().autoData["lead:vol"];
    get().moveAutoPoint("lead", "vol", 9, { t: 1, v: 1 });
    expect(get().autoData["lead:vol"]).toBe(before); // unchanged
  });

  it("deleteAutoPoint removes a point but refuses to drop below one", () => {
    get().setAutoPoints("lead", "vol", [
      { t: 0, v: 0.2 },
      { t: 32, v: 0.5 },
      { t: 64, v: 0.8 },
    ]);
    get().deleteAutoPoint("lead", "vol", 1);
    expect(get().autoData["lead:vol"]).toEqual([
      { t: 0, v: 0.2 },
      { t: 64, v: 0.8 },
    ]);

    get().setAutoPoints("lead", "vol", [{ t: 0, v: 0.5 }]);
    get().deleteAutoPoint("lead", "vol", 0);
    expect(get().autoData["lead:vol"]).toHaveLength(1); // min one point kept
  });
});

describe("useDawStore — session hydration", () => {
  it("setCurrentSessionName stores the name", () => {
    get().setCurrentSessionName("My Song");
    expect(get().currentSessionName).toBe("My Song");
  });

  it("hydrateSession applies provided fields and falls back for the rest", () => {
    useDawStore.setState({ bpm: 100, masterPan: 0.9 });
    get().hydrateSession({ bpm: 90, countIn: 4 });
    expect(get().bpm).toBe(90);
    expect(get().countIn).toBe(4);
    expect(get().masterPan).toBe(0.9); // untouched (not in payload)
  });

  it("hydratePrefs applies provided preferences", () => {
    get().hydratePrefs({ theme: "midnight", autoSave: false });
    expect(get().theme).toBe("midnight");
    expect(get().autoSave).toBe(false);
  });

  it("newSession resets musical state and clears the session name", () => {
    useDawStore.setState({
      bpm: 90,
      currentSessionName: "X",
      mutes: { kick: true },
      masterVolume: 0.3,
    });
    get().newSession();
    const s = get();
    expect(s.bpm).toBe(124);
    expect(s.currentSessionName).toBeNull();
    expect(s.mutes).toEqual({});
    expect(s.masterVolume).toBe(1);
    expect(s.returnGains).toEqual([1, 1]);
  });
});

describe("useDawStore — frame tick & engine state", () => {
  it("tick is inert when paused and returns the current integer beat", () => {
    useDawStore.setState({ playing: false, playhead: 12.7, reel: 33 });
    const beat = get().tick(0.5);
    expect(beat).toBe(12);
    expect(get().playhead).toBe(12.7);
    expect(get().reel).toBe(33);
  });

  it("tick advances the playhead by dt·bpm/60 while playing", () => {
    useDawStore.setState({ playing: true, playhead: 0, bpm: 120, loop: false });
    const beat = get().tick(1);
    expect(get().playhead).toBeCloseTo(2, 5);
    expect(beat).toBe(2);
  });

  it("tick wraps the playhead at the timeline end when not looping", () => {
    useDawStore.setState({ playing: true, playhead: 127, bpm: 120, loop: false });
    get().tick(1); // 127 + 2 = 129 → wraps to 1
    expect(get().playhead).toBeCloseTo(1, 5);
  });

  it("tick loops within [loopStart, loopEnd] when LOOP is on", () => {
    useDawStore.setState({ playing: true, loop: true, loopStart: 4, loopEnd: 8, playhead: 7.5, bpm: 120 });
    get().tick(1); // 7.5 + 2 = 9.5 → wrap into [4,8) → 4 + (9.5-4)%4 = 5.5
    expect(get().playhead).toBeCloseTo(5.5, 5);
    expect(get().playhead).toBeLessThan(8);
  });

  it("setMeterLevels peak-holds with decay (held below prev*0.85, replaced above)", () => {
    useDawStore.setState({ master: 1, levels: { a: 1 }, groupLevels: {}, returnLevels: [1, 0] });
    get().setMeterLevels({ a: 0.5 }, {}, [0.5, 0], 0.5);
    expect(get().master).toBeCloseTo(0.85, 5); // max(0.5, 1*0.85)
    expect(get().levels.a).toBeCloseTo(0.85, 5);
    expect(get().returnLevels[0]).toBeCloseTo(0.85, 5);
    get().setMeterLevels({ a: 0.95 }, {}, [0, 0], 0.95);
    expect(get().master).toBeCloseTo(0.95, 5); // incoming above the decayed hold
    expect(get().levels.a).toBeCloseTo(0.95, 5);
  });

  it("setEngineState applies pushed fields and falls back for missing ones", () => {
    useDawStore.setState({ playhead: 5, bpm: 100 });
    get().setEngineState({ playhead: 20, playing: true, tempo: 140 });
    const s = get();
    expect(s.playhead).toBe(20);
    expect(s.playing).toBe(true);
    expect(s.bpm).toBe(140); // tempo → bpm
  });
});

describe("useDawStore — piano-roll editor & MIDI notes", () => {
  const newClipTrack = () => {
    const tid = get().addTrack({ type: "midi" });
    get().addClip(tid, { id: "pc", bar: 0, len: 2, name: "Clip" }); // len 2 bars = 8 beats
    return tid;
  };
  const clipOf = (tid: string) => get().tracks.find((t) => t.id === tid)!.clips.find((c) => c.id === "pc")!;

  it("openEditor seeds notes from the pattern and sets editor state", () => {
    const tid = newClipTrack();
    expect(clipOf(tid).notes).toBeUndefined();
    get().openEditor(tid, "pc");
    expect(get().editorOpen).toBe(true);
    expect(get().editorClip).toBe("pc");
    expect(get().editorTrack).toBe(tid);
    expect((clipOf(tid).notes?.length ?? 0)).toBeGreaterThan(0); // materialized
    get().closeEditor();
    expect(get().editorOpen).toBe(false);
  });

  it("ensureClipNotes does not overwrite existing notes", () => {
    const tid = newClipTrack();
    get().addNote(tid, "pc", { id: "n1", start: 0, len: 1, pitch: 60 });
    get().ensureClipNotes(tid, "pc");
    expect(clipOf(tid).notes).toEqual([{ id: "n1", start: 0, len: 1, pitch: 60, velocity: 0.8 }]);
  });

  it("note add/move/resize clamp to the clip and pitch range", () => {
    const tid = newClipTrack(); // 8 beats
    get().addNote(tid, "pc", { id: "n1", start: 99, len: 0, pitch: 999 });
    let n = clipOf(tid).notes![0];
    expect(n.pitch).toBe(PITCH_MAX);            // clamped to range
    expect(n.len).toBeGreaterThan(0);
    expect(n.start).toBeLessThanOrEqual(8 - n.len);

    get().moveNote(tid, "pc", "n1", -5, -5);
    n = clipOf(tid).notes![0];
    expect(n.start).toBe(0);
    expect(n.pitch).toBe(PITCH_MIN);

    get().resizeNote(tid, "pc", "n1", 999);
    expect(clipOf(tid).notes![0].len).toBe(8 - clipOf(tid).notes![0].start);

    get().removeNote(tid, "pc", "n1");
    expect(clipOf(tid).notes).toEqual([]);
  });

  it("notes survive a serialize -> hydrate round-trip", () => {
    const tid = newClipTrack();
    get().addNote(tid, "pc", { id: "n1", start: 1, len: 2, pitch: 64 });
    const ui = serializeSession(get());
    get().newSession();
    expect(get().tracks.some((t) => t.id === tid)).toBe(false); // reset
    get().hydrateSession(ui);
    const restored = get().tracks.find((t) => t.id === tid)!.clips.find((c) => c.id === "pc")!;
    expect(restored.notes).toEqual([{ id: "n1", start: 1, len: 2, pitch: 64, velocity: 0.8 }]);
  });
});

describe("useDawStore — cross-track drag, clipboard, rename, velocity", () => {
  it("moveClipToTrack relocates a clip and clamps the bar", () => {
    const a = get().addTrack({ type: "midi" });
    const b = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "x", bar: 0, len: 4, name: "X" });
    get().moveClipToTrack(a, "x", b, 999);
    const ta = get().tracks.find((t) => t.id === a)!;
    const tb = get().tracks.find((t) => t.id === b)!;
    expect(ta.clips.some((c) => c.id === "x")).toBe(false);
    const moved = tb.clips.find((c) => c.id === "x")!;
    expect(moved.bar).toBe(32 - 4); // clamped to the grid
    expect(get().selTrack).toBe(b);
  });

  it("copy/paste yields a fresh clip + note ids and selects it; cut removes the original", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "src", bar: 0, len: 2, name: "Loop", notes: [{ id: "n1", start: 0, len: 1, pitch: 60, velocity: 0.8 }] });
    get().copyClip(a, "src");
    const pasted = get().pasteClip(a, 4)!;
    expect(pasted).not.toBe("src");
    const clips = () => get().tracks.find((t) => t.id === a)!.clips;
    const copy = clips().find((c) => c.id === pasted)!;
    expect(copy.bar).toBe(4);
    expect(copy.notes![0].id).not.toBe("n1"); // fresh note id
    expect(get().selClip).toBe(pasted);

    get().cutClip(a, "src");
    expect(clips().some((c) => c.id === "src")).toBe(false);
    // clipboard still holds the cut clip → can paste again
    expect(get().pasteClip(a, 0)).not.toBeNull();
  });

  it("renameClip updates the clip name", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "c", bar: 0, len: 1, name: "Old" });
    get().renameClip(a, "c", "New");
    expect(get().tracks.find((t) => t.id === a)!.clips[0].name).toBe("New");
  });

  it("setNoteVelocity clamps to 0..1 and addNote defaults to 0.8", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "c", bar: 0, len: 2, name: "C" });
    get().addNote(a, "c", { id: "n1", start: 0, len: 1, pitch: 60 });
    const note = () => get().tracks.find((t) => t.id === a)!.clips[0].notes!.find((n) => n.id === "n1")!;
    expect(note().velocity).toBe(0.8);
    get().setNoteVelocity(a, "c", "n1", 5);
    expect(note().velocity).toBe(1);
    get().setNoteVelocity(a, "c", "n1", -1);
    expect(note().velocity).toBe(0);
  });
});

describe("useDawStore — multi-clip selection & note clipboard", () => {
  it("setClipSelection + removeSelectedClips removes the set across tracks", () => {
    const a = get().addTrack({ type: "midi" });
    const b = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "a1", bar: 0, len: 2, name: "A1" });
    get().addClip(b, { id: "b1", bar: 0, len: 2, name: "B1" });
    get().setClipSelection(["a1", "b1"]);
    expect(get().selClips).toEqual(["a1", "b1"]);
    get().removeSelectedClips();
    const has = (tid: string, cid: string) => get().tracks.find((t) => t.id === tid)!.clips.some((c) => c.id === cid);
    expect(has(a, "a1")).toBe(false);
    expect(has(b, "b1")).toBe(false);
    expect(get().selClips).toEqual([]);
  });

  it("duplicateSelectedClips clones the set and selects the copies; setClipBars clamps", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "c1", bar: 0, len: 2, name: "C" });
    get().setClipSelection(["c1"]);
    get().duplicateSelectedClips();
    const clips = () => get().tracks.find((t) => t.id === a)!.clips;
    expect(clips()).toHaveLength(2);
    expect(get().selClips).not.toContain("c1");        // selection moved to the copy
    expect(get().selClips).toHaveLength(1);

    get().setClipBars([{ trackId: a, clipId: "c1", bar: 999 }]);
    expect(clips().find((c) => c.id === "c1")!.bar).toBe(32 - 2); // clamped to grid
  });

  it("copyNotes normalizes to 0 and pasteNotes places fresh ids at the anchor", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "c", bar: 0, len: 4, name: "C" }); // 16 beats
    get().addNote(a, "c", { id: "n1", start: 2, len: 1, pitch: 60 });
    get().addNote(a, "c", { id: "n2", start: 4, len: 1, pitch: 62 });
    get().copyNotes(a, "c", ["n1", "n2"]);
    const pasted = get().pasteNotes(a, "c", 8);
    expect(pasted).toHaveLength(2);
    const notes = () => get().tracks.find((t) => t.id === a)!.clips[0].notes!;
    const byId = (id: string) => notes().find((n) => n.id === id)!;
    expect(byId(pasted[0]).start).toBe(8);             // earliest normalized to 0 → anchor
    expect(byId(pasted[1]).start).toBe(10);            // 2 beats after, preserved
    expect(pasted).not.toContain("n1");                // fresh ids
  });

  it("setNotePositions and removeNotes operate on batches with clamping", () => {
    const a = get().addTrack({ type: "midi" });
    get().addClip(a, { id: "c", bar: 0, len: 2, name: "C" }); // 8 beats
    get().addNote(a, "c", { id: "n1", start: 0, len: 1, pitch: 60 });
    get().addNote(a, "c", { id: "n2", start: 2, len: 1, pitch: 62 });
    get().setNotePositions(a, "c", [{ id: "n1", start: -5, pitch: 999 }, { id: "n2", start: 3, pitch: 50 }]);
    const notes = () => get().tracks.find((t) => t.id === a)!.clips[0].notes!;
    expect(notes().find((n) => n.id === "n1")!.start).toBe(0);    // clamped
    expect(notes().find((n) => n.id === "n2")!.pitch).toBe(50);
    get().removeNotes(a, "c", ["n1", "n2"]);
    expect(notes()).toEqual([]);
  });
});

describe("useDawStore — tick robustness", () => {
  it("advances without throwing when tracks have no explicit volumes", () => {
    useDawStore.setState({ playing: true, playhead: 0, volumes: {} });
    expect(() => get().tick(0.1)).not.toThrow();
    expect(DEFAULT_VOLUME).toBe(0.8);
  });
});
