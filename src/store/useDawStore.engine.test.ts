import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the engine client so `engineActive()` is true and every command is a
// spy. This exercises the `if (engineActive())` branches in the store actions
// (and the helpers reachable only when hosted) that the plain-browser test
// file cannot reach.
vi.mock("../lib/engine", () => {
  const grp = <T extends Record<string, unknown>>(o: T) => o;
  const engine = {
    transport: grp({
      setPlaying: vi.fn(), stop: vi.fn(), setPosition: vi.fn(), setLooping: vi.fn(),
      setRecording: vi.fn(), setTempo: vi.fn(), setLoopStart: vi.fn(), setLoopEnd: vi.fn(),
    }),
    mixer: grp({
      setTrackVolume: vi.fn(), setTrackPan: vi.fn(), setTrackMute: vi.fn(), setTrackSolo: vi.fn(),
      setTrackArm: vi.fn(), setTrackGroup: vi.fn(), setTrackSend: vi.fn(),
      setMasterVolume: vi.fn(), setMasterPan: vi.fn(),
    }),
    group: grp({ setGain: vi.fn(), setPan: vi.fn(), setMute: vi.fn(), setSolo: vi.fn() }),
    returns: grp({ setGain: vi.fn() }),
    automation: grp({ set: vi.fn(), clear: vi.fn(), clearAll: vi.fn() }),
    node: grp({
      add: vi.fn(), remove: vi.fn(), setBypass: vi.fn(), openEditor: vi.fn(),
      closeEditor: vi.fn(), listParams: vi.fn(),
    }),
    track: grp({ assignFile: vi.fn(), pickFile: vi.fn(), clearFile: vi.fn() }),
    device: grp({
      setBypass: vi.fn(), setParam: vi.fn(), openEditor: vi.fn(), closeEditor: vi.fn(), listParams: vi.fn(),
    }),
    plugins: grp({ scan: vi.fn(), assign: vi.fn(), pickFile: vi.fn() }),
    audio: grp({
      getDevices: vi.fn(() => Promise.resolve(undefined)),
      setSettings: vi.fn(() => Promise.resolve(undefined)),
    }),
    source: grp({ pickFile: vi.fn(), setInputMode: vi.fn() }),
    session: grp({
      save: vi.fn(), load: vi.fn(), list: vi.fn(), remove: vi.fn(), export: vi.fn(),
      import: vi.fn(), savePrefs: vi.fn(), loadPrefs: vi.fn(),
    }),
  };
  return { engine, engineActive: () => true, subscribeEngine: () => () => {} };
});

import { useDawStore } from "./useDawStore";
import { engine } from "../lib/engine";

const pristine = { ...useDawStore.getState() };
const get = () => useDawStore.getState();

beforeEach(() => {
  useDawStore.setState(pristine, true);
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDawStore (hosted) — commands reach the engine", () => {
  it("transport actions dispatch", () => {
    get().togglePlay();
    expect(engine.transport.setPlaying).toHaveBeenCalledWith(true);
    get().stop();
    expect(engine.transport.stop).toHaveBeenCalled();
    get().rewind();
    expect(engine.transport.setPosition).toHaveBeenCalledWith(0);
    get().toggleRecord();
    expect(engine.transport.setRecording).toHaveBeenCalledWith(true);
    get().toggleLoop();
    expect(engine.transport.setLooping).toHaveBeenCalled();
    get().setBpm(130);
    expect(engine.transport.setTempo).toHaveBeenCalledWith(130);
    get().setLoopStart(4);
    expect(engine.transport.setLoopStart).toHaveBeenCalledWith(4);
    get().setLoopEnd(100);
    expect(engine.transport.setLoopEnd).toHaveBeenCalledWith(100);
  });

  it("mixer / track actions dispatch", () => {
    get().toggleMute("kick");
    expect(engine.mixer.setTrackMute).toHaveBeenCalledWith("kick", true);
    get().toggleSolo("snare");
    expect(engine.mixer.setTrackSolo).toHaveBeenCalledWith("snare", true);
    get().toggleArm("hat");
    expect(engine.mixer.setTrackArm).toHaveBeenCalledWith("hat", true);
    get().setVolume("lead", 0.5);
    expect(engine.mixer.setTrackVolume).toHaveBeenCalledWith("lead", 0.5);
    get().setPan("lead", 0.2);
    expect(engine.mixer.setTrackPan).toHaveBeenCalledWith("lead", 0.2);
    get().setMasterVolume(0.7);
    expect(engine.mixer.setMasterVolume).toHaveBeenCalledWith(0.7);
    get().setMasterPan(0.4);
    expect(engine.mixer.setMasterPan).toHaveBeenCalledWith(0.4);
    get().setSend("lead", 1, 0.3);
    expect(engine.mixer.setTrackSend).toHaveBeenCalledWith("lead", 1, 0.3);
    get().pickTrackFile("lead");
    expect(engine.track.pickFile).toHaveBeenCalledWith("lead");
    get().assignTrackFile("lead", "/a.wav");
    expect(engine.track.assignFile).toHaveBeenCalledWith("lead", "/a.wav");
    get().clearTrackFile("lead");
    expect(engine.track.clearFile).toHaveBeenCalledWith("lead");
  });

  it("group / return / device actions dispatch", () => {
    get().toggleGroupMute("g-drums");
    expect(engine.group.setMute).toHaveBeenCalledWith("g-drums", true);
    get().toggleGroupSolo("g-drums");
    expect(engine.group.setSolo).toHaveBeenCalledWith("g-drums", true);
    get().setGroupVolume("g-drums", 0.6);
    expect(engine.group.setGain).toHaveBeenCalledWith("g-drums", 0.6);
    get().setGroupPan("g-drums", 0.3);
    expect(engine.group.setPan).toHaveBeenCalledWith("g-drums", 0.3);
    get().setReturnGain(0, 0.5);
    expect(engine.returns.setGain).toHaveBeenCalledWith(0, 0.5);
    // store holds "enabled"; engine takes the inverse "bypassed"
    get().toggleDevice("tape");
    expect(engine.device.setBypass).toHaveBeenCalledWith("tape", false);
    get().setPreAmount(0.5);
    expect(engine.device.setParam).toHaveBeenCalledWith("pre", "amount", 0.5);
  });

  it("node-device actions dispatch", () => {
    get().addNodeDevice("lead", "eq");
    expect(engine.node.add).toHaveBeenCalledWith("lead", "eq");
    get().removeNodeDevice("lead", "eq");
    expect(engine.node.remove).toHaveBeenCalledWith("lead", "eq");
    get().setNodeDeviceBypass("lead", "eq", true);
    expect(engine.node.setBypass).toHaveBeenCalledWith("lead", "eq", true);
    get().openNodeEditor("lead", "eq");
    expect(engine.node.openEditor).toHaveBeenCalledWith("lead", "eq");
  });

  it("audio device settings query and apply the engine", () => {
    get().setSampleRate(44.1);
    expect(engine.audio.setSettings).toHaveBeenCalledWith({ sampleRate: 44100 }); // kHz→Hz
    get().setBufferSize(256);
    expect(engine.audio.setSettings).toHaveBeenCalledWith({ bufferSize: 256 });
    get().setOutputDevice("Iface");
    expect(engine.audio.setSettings).toHaveBeenCalledWith({ outputDevice: "Iface" });
    get().refreshDevices();
    expect(engine.audio.getDevices).toHaveBeenCalled();
  });

  it("newSession clears engine automation then re-pushes the (empty) mix", () => {
    get().newSession();
    expect(engine.automation.clearAll).toHaveBeenCalled();
    expect(engine.transport.setTempo).toHaveBeenCalledWith(124);
  });
});

describe("useDawStore (hosted) — automation lane lifecycle", () => {
  it("enabling a lane pushes each edited param; disabling clears them and reasserts manual", () => {
    useDawStore.setState({
      autoData: { "lead:vol": [{ t: 0, v: 0.5 }], "lead:pan": [{ t: 0, v: 0.5 }] },
      autoLanes: {},
    });
    get().toggleAuto("lead"); // enable
    expect(engine.automation.set).toHaveBeenCalledWith("lead", "vol", [{ t: 0, v: 0.5 }]);
    expect(engine.automation.set).toHaveBeenCalledWith("lead", "pan", [{ t: 0, v: 0.5 }]);

    vi.clearAllMocks();
    get().toggleAuto("lead"); // disable → clear + reassert track manual
    expect(engine.automation.clear).toHaveBeenCalledWith("lead", "vol");
    expect(engine.mixer.setTrackVolume).toHaveBeenCalled(); // reassertNodeManual (track branch)
    expect(engine.mixer.setTrackSend).toHaveBeenCalled();
  });

  it("reasserts the right manual target for group / return / master nodes", () => {
    useDawStore.setState({
      autoData: { "g-drums:vol": [{ t: 0, v: 1 }], "return-0:rgain": [{ t: 0, v: 1 }], "master:mvol": [{ t: 0, v: 1 }] },
      autoLanes: { "g-drums": true, "return-0": true, master: true },
    });
    get().toggleAuto("g-drums");
    expect(engine.group.setGain).toHaveBeenCalledWith("g-drums", 1);
    get().toggleAuto("return-0");
    expect(engine.returns.setGain).toHaveBeenCalledWith(0, 1);
    get().toggleAuto("master");
    expect(engine.mixer.setMasterVolume).toHaveBeenCalled();
    expect(engine.mixer.setMasterPan).toHaveBeenCalled();
  });

  it("editing an enabled lane debounce-pushes the new envelope", () => {
    vi.useFakeTimers();
    useDawStore.setState({ autoLanes: { lead: true } });
    get().setAutoPoints("lead", "vol", [{ t: 0, v: 0.1 }]);
    expect(engine.automation.set).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(100);
    expect(engine.automation.set).toHaveBeenCalledWith("lead", "vol", [{ t: 0, v: 0.1 }]);
  });

  it("does not push edits for a disabled lane", () => {
    vi.useFakeTimers();
    useDawStore.setState({ autoLanes: {} });
    get().addAutoPoint("lead", "vol", { t: 5, v: 0.5 });
    vi.advanceTimersByTime(100);
    expect(engine.automation.set).not.toHaveBeenCalled();
  });
});
