// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceChain } from "./DeviceChain";
import { DeviceModule } from "./DeviceModule";
import { useDawStore } from "../../store/useDawStore";
import { ITEM_MIME } from "../../lib/dnd";
import { MIN_RACK_H } from "../../lib/constants";
import type { NodeRacks } from "../../lib/engine";

// Snapshot the slice DeviceChain / DeviceModule read & mutate so tests stay
// order-independent.
type Snapshot = {
  selTrack: string;
  rackOpen: boolean;
  rackHeight: number;
  nodeRacks: NodeRacks;
  devices: { eq: boolean; tape: boolean; pre: boolean };
};

let snapshot: Snapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    selTrack: s.selTrack,
    rackOpen: s.rackOpen,
    rackHeight: s.rackHeight,
    nodeRacks: s.nodeRacks,
    devices: { ...s.devices },
  };
  // Known baseline for these tests.
  useDawStore.setState({ rackOpen: true, rackHeight: 300, nodeRacks: {} });
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

// startUiResize attaches pointermove/pointerup to globalThis; happy-dom may lack
// PointerEvent, so fall back to MouseEvent (the handler only reads clientY).
const PtrEvent = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
const movePointerY = (clientY: number) =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointermove", { clientY, clientX: 0, bubbles: true }));
const releasePointer = () =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointerup", { bubbles: true }));

/** Build a DataTransfer-ish stub that carries (or doesn't) one of our items. */
function makeDataTransfer(item?: { kind: string; name: string }): DataTransfer {
  const store: Record<string, string> = {};
  if (item) store[ITEM_MIME] = JSON.stringify(item);
  return {
    dropEffect: "",
    effectAllowed: "",
    types: Object.keys(store),
    getData: (t: string) => store[t] ?? "",
    setData: (t: string, v: string) => {
      store[t] = v;
    },
  } as unknown as DataTransfer;
}

describe("DeviceChain — resize", () => {
  it("dragging the top grip up grows the rack; dragging well past the floor clamps to the min", () => {
    render(<DeviceChain />);
    const grip = screen.getByTitle("Drag to resize the device chain");

    // Default height 300; drag the top edge UP by 100 (clientY 400 → 300) → 400.
    fireEvent.pointerDown(grip, { button: 0, clientX: 0, clientY: 400 });
    movePointerY(300);
    releasePointer();
    expect(useDawStore.getState().rackHeight).toBe(400);

    // Drag the top edge far DOWN → clamps to MIN_RACK_H.
    fireEvent.pointerDown(grip, { button: 0, clientX: 0, clientY: 100 });
    movePointerY(3000);
    releasePointer();
    expect(useDawStore.getState().rackHeight).toBe(MIN_RACK_H);
  });

  it("renders no resize grip when the rack is collapsed", () => {
    useDawStore.setState({ rackOpen: false });
    render(<DeviceChain />);
    expect(screen.queryByTitle("Drag to resize the device chain")).not.toBeInTheDocument();
  });
});

describe("DeviceChain — header", () => {
  it("renders the DEVICE CHAIN header and signal-flow hint", () => {
    render(<DeviceChain />);
    expect(screen.getByText("DEVICE CHAIN")).toBeInTheDocument();
    expect(screen.getByText("signal flows left → right")).toBeInTheDocument();
  });

  it("resolves a track node to its name and shows the device count label", () => {
    useDawStore.setState({ selTrack: "kick", nodeRacks: {} });
    render(<DeviceChain />);

    // KICK is the seed track for id "kick".
    expect(screen.getByText("KICK")).toBeInTheDocument();
    // No devices on this node → "0 devices" (plural).
    expect(screen.getByText("0 devices")).toBeInTheDocument();
  });

  it("uses the singular device label when a node has exactly one device", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d1", kind: "eq", name: "ZANDERS EQ", bypassed: false }] },
    });
    render(<DeviceChain />);
    expect(screen.getByText("1 device")).toBeInTheDocument();
  });

  it("shows MASTER BUS name and the mastering-chain label for the master node", () => {
    useDawStore.setState({ selTrack: "master" });
    render(<DeviceChain />);
    expect(screen.getByText("MASTER BUS")).toBeInTheDocument();
    expect(screen.getByText("master mastering chain")).toBeInTheDocument();
  });

  it("resolves a group node id to the group name", () => {
    useDawStore.setState({ selTrack: "g-drums" });
    render(<DeviceChain />);
    expect(screen.getByText("DRUMS")).toBeInTheDocument();
  });

  it("resolves a return node id to RETURN A / RETURN B", () => {
    useDawStore.setState({ selTrack: "return-0" });
    const { unmount } = render(<DeviceChain />);
    expect(screen.getByText("RETURN A")).toBeInTheDocument();
    unmount();

    useDawStore.setState({ selTrack: "return-1" });
    render(<DeviceChain />);
    expect(screen.getByText("RETURN B")).toBeInTheDocument();
  });

  it("falls back to MASTER BUS for an unknown selected node id", () => {
    useDawStore.setState({ selTrack: "does-not-exist" });
    render(<DeviceChain />);
    expect(screen.getByText("MASTER BUS")).toBeInTheDocument();
  });

  it("toggle button flips rackOpen in the store", () => {
    render(<DeviceChain />);
    expect(useDawStore.getState().rackOpen).toBe(true);
    fireEvent.click(screen.getByTitle("Toggle device chain"));
    expect(useDawStore.getState().rackOpen).toBe(false);
    fireEvent.click(screen.getByTitle("Toggle device chain"));
    expect(useDawStore.getState().rackOpen).toBe(true);
  });
});

describe("DeviceChain — master mastering chain", () => {
  beforeEach(() => {
    useDawStore.setState({ selTrack: "master", rackOpen: true });
  });

  it("renders the three reserved Zanders device modules and the empty add slot", () => {
    render(<DeviceChain />);
    // DeviceModule wordmark renders the product names.
    expect(screen.getByText("EQ")).toBeInTheDocument();
    expect(screen.getByText("TapeStop")).toBeInTheDocument();
    expect(screen.getByText("PreDrop")).toBeInTheDocument();

    // Their VST3 filenames render in the captions.
    expect(screen.getByText("ZandersEQ.vst3")).toBeInTheDocument();
    expect(screen.getByText("ZandersTapeStop.vst3")).toBeInTheDocument();
    expect(screen.getByText("ZandersPreDrop.vst3")).toBeInTheDocument();

    // The AddDeviceSlot affordance.
    expect(screen.getByText("ADD DEVICE")).toBeInTheDocument();
    expect(screen.getByText("drop .vst3")).toBeInTheDocument();
  });

  it("does not render the node-rack add-device menu in master mode", () => {
    render(<DeviceChain />);
    expect(screen.queryByText("+ Choose device")).not.toBeInTheDocument();
  });
});

describe("DeviceChain — node rack (non-master)", () => {
  beforeEach(() => {
    useDawStore.setState({ selTrack: "kick", rackOpen: true, nodeRacks: {} });
  });

  it("renders the ADD DEVICE menu with the collapsed Choose device button and drag hint", () => {
    render(<DeviceChain />);
    expect(screen.getByText("ADD DEVICE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Choose device" })).toBeInTheDocument();
    expect(screen.getByText("or drag an FX here")).toBeInTheDocument();
  });

  it("expanding the menu lists every FX item plus an External VST3 entry", () => {
    render(<DeviceChain />);
    fireEvent.click(screen.getByRole("button", { name: "+ Choose device" }));

    // FX items from the PLUGINS / FX seed category.
    expect(screen.getByRole("button", { name: "+ ZandersEQ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ ZandersTapeStop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ ZandersPreDrop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Bus Compressor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Hall Reverb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ External VST3…" })).toBeInTheDocument();

    // Collapsed entry is gone once expanded.
    expect(screen.queryByRole("button", { name: "+ Choose device" })).not.toBeInTheDocument();
  });

  it("clicking an FX menu entry adds a device to the node rack and collapses the menu", () => {
    render(<DeviceChain />);
    fireEvent.click(screen.getByRole("button", { name: "+ Choose device" }));
    fireEvent.click(screen.getByRole("button", { name: "+ ZandersEQ" }));

    const rack = useDawStore.getState().nodeRacks.kick;
    expect(rack).toHaveLength(1);
    expect(rack[0].kind).toBe("eq");
    expect(rack[0].name).toBe("ZANDERS EQ");
    expect(rack[0].bypassed).toBe(false);

    // Menu collapses back to the Choose-device button.
    expect(screen.getByRole("button", { name: "+ Choose device" })).toBeInTheDocument();
  });

  it("a generic FX entry slugs its kind and uppercases its name", () => {
    render(<DeviceChain />);
    fireEvent.click(screen.getByRole("button", { name: "+ Choose device" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Bus Compressor" }));

    const rack = useDawStore.getState().nodeRacks.kick;
    expect(rack).toHaveLength(1);
    expect(rack[0].kind).toBe("bus-compressor");
    expect(rack[0].name).toBe("BUS COMPRESSOR");
  });

  it("renders a device card for each seeded node device with its house label", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: {
        kick: [
          { id: "d-eq", kind: "eq", name: "ZANDERS EQ", bypassed: false },
          { id: "d-tape", kind: "tape", name: "TAPE STOP", bypassed: true },
        ],
      },
    });
    render(<DeviceChain />);

    // House plugins use their KNOWN_META label, not the stored name.
    expect(screen.getByText("ZANDERS EQ")).toBeInTheDocument();
    expect(screen.getByText("TAPE STOP")).toBeInTheDocument();

    // ON button for the active device, BYP for the bypassed one.
    expect(screen.getByRole("button", { name: "ON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BYP" })).toBeInTheDocument();
  });

  it("a generic device falls back to its own stored name as the label", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d1", kind: "reverb", name: "HALL REVERB", bypassed: false }] },
    });
    render(<DeviceChain />);
    expect(screen.getByText("HALL REVERB")).toBeInTheDocument();
  });

  it("flags a missing plugin with a warning glyph in the label", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d1", kind: "vst3", name: "GHOST FX", bypassed: false, missing: true }] },
    });
    render(<DeviceChain />);
    expect(screen.getByText("GHOST FX ⚠")).toBeInTheDocument();
  });

  it("the device-card ON/BYP button toggles bypass in the store", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d-eq", kind: "eq", name: "ZANDERS EQ", bypassed: false }] },
    });
    render(<DeviceChain />);

    fireEvent.click(screen.getByRole("button", { name: "ON" }));
    expect(useDawStore.getState().nodeRacks.kick[0].bypassed).toBe(true);
    // The button now reflects the bypassed state.
    expect(screen.getByRole("button", { name: "BYP" })).toBeInTheDocument();
  });

  it("the remove (✕) button deletes the device from the node rack", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d-eq", kind: "eq", name: "ZANDERS EQ", bypassed: false }] },
    });
    render(<DeviceChain />);

    fireEvent.click(screen.getByTitle("Remove device"));
    // Rack emptied → key omitted from nodeRacks.
    expect(useDawStore.getState().nodeRacks.kick).toBeUndefined();
  });

  it("the EDIT button is present and clickable without throwing (offline no-op)", () => {
    useDawStore.setState({
      selTrack: "kick",
      nodeRacks: { kick: [{ id: "d-eq", kind: "eq", name: "ZANDERS EQ", bypassed: false }] },
    });
    render(<DeviceChain />);
    const editBtn = screen.getByRole("button", { name: "EDIT" });
    expect(editBtn).toBeInTheDocument();
    // openNodeEditor is a no-op offline; just confirm it doesn't blow up.
    fireEvent.click(editBtn);
    expect(useDawStore.getState().nodeRacks.kick).toHaveLength(1);
  });

  it("dropping an FX browser item onto the add-device zone adds it to the rack", () => {
    render(<DeviceChain />);
    const zone = screen.getByText("ADD DEVICE").parentElement as HTMLElement;

    const dt = makeDataTransfer({ kind: "fx", name: "Hall Reverb" });
    fireEvent.dragOver(zone, { dataTransfer: dt });
    fireEvent.drop(zone, { dataTransfer: dt });

    const rack = useDawStore.getState().nodeRacks.kick;
    expect(rack).toHaveLength(1);
    expect(rack[0].name).toBe("HALL REVERB");
    expect(rack[0].kind).toBe("hall-reverb");
  });

  it("dropping a non-FX item is ignored by the add-device zone", () => {
    render(<DeviceChain />);
    const zone = screen.getByText("ADD DEVICE").parentElement as HTMLElement;

    const dt = makeDataTransfer({ kind: "audio", name: "Analog Kick 04" });
    fireEvent.drop(zone, { dataTransfer: dt });

    expect(useDawStore.getState().nodeRacks.kick).toBeUndefined();
  });

  it("a drag with no recognised item does not enable the copy drop effect", () => {
    render(<DeviceChain />);
    const zone = screen.getByText("ADD DEVICE").parentElement as HTMLElement;

    const dt = makeDataTransfer(); // no ITEM_MIME payload
    fireEvent.dragOver(zone, { dataTransfer: dt });
    // hasDragItem() is false → handler bails before setting dropEffect.
    expect(dt.dropEffect).toBe("");
  });
});

describe("DeviceModule", () => {
  // Snapshot/restore the device bypass flags.
  let devSnap: { eq: boolean; tape: boolean; pre: boolean };
  beforeEach(() => {
    devSnap = { ...useDawStore.getState().devices };
  });
  afterEach(() => {
    useDawStore.setState({ devices: devSnap });
  });

  it("renders the wordmark product, the VST3 badge, filename, and tag", () => {
    useDawStore.setState({ devices: { ...devSnap, eq: true } });
    render(
      <DeviceModule
        device="eq"
        accent="#34d8ff"
        product="EQ"
        productColor="var(--spectrum-cyan)"
        filename="ZandersEQ.vst3"
        tag="4 BANDS"
        tagColor="var(--spectrum-cyan)"
      >
        <div data-testid="well-child">child</div>
      </DeviceModule>,
    );

    expect(screen.getByText("EQ")).toBeInTheDocument();
    expect(screen.getByText("VST3")).toBeInTheDocument();
    expect(screen.getByText("ZandersEQ.vst3")).toBeInTheDocument();
    expect(screen.getByText("4 BANDS")).toBeInTheDocument();
    // The well renders its children.
    expect(screen.getByTestId("well-child")).toBeInTheDocument();
  });

  it("the bypass power button toggles the device flag in the store", () => {
    useDawStore.setState({ devices: { ...devSnap, eq: true } });
    render(
      <DeviceModule
        device="eq"
        accent="#34d8ff"
        product="EQ"
        productColor="var(--spectrum-cyan)"
        filename="ZandersEQ.vst3"
        tag="4 BANDS"
        tagColor="var(--spectrum-cyan)"
      >
        <span />
      </DeviceModule>,
    );

    expect(useDawStore.getState().devices.eq).toBe(true);
    fireEvent.click(screen.getByTitle("Bypass"));
    expect(useDawStore.getState().devices.eq).toBe(false);
  });

  it("double-clicking the well is a no-op offline (engine inactive)", () => {
    render(
      <DeviceModule
        device="pre"
        accent="#ff5fa8"
        product="PreDrop"
        productColor="var(--spectrum-pink)"
        filename="ZandersPreDrop.vst3"
        tag="BUILD-UP"
        tagColor="var(--spectrum-pink)"
      >
        <span data-testid="pre-well">x</span>
      </DeviceModule>,
    );
    const well = screen.getByTestId("pre-well").parentElement as HTMLElement;
    // No window.__JUCE__ → engineActive() is false → no title hint, no throw.
    fireEvent.doubleClick(well);
    expect(well).not.toHaveAttribute("title");
  });
});

describe("DeviceModule — hosted (engine active) double-click opens the editor", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: { __JUCE__?: unknown } }).window?.__JUCE__;
  });

  it("calls the native deviceOpenEditor command when JUCE backend is present", () => {
    // JS->C++ commands go through emitEvent("__juce__invoke", { name, params }),
    // so the command token lives in the payload's `name` field.
    const invoked: string[] = [];
    (globalThis as unknown as { window: { __JUCE__: unknown } }).window.__JUCE__ = {
      backend: {
        emitEvent: (id: string, payload: unknown) => {
          if (id === "__juce__invoke") invoked.push((payload as { name: string }).name);
        },
        addEventListener: () => undefined,
      },
    };

    render(
      <DeviceModule
        device="eq"
        accent="#34d8ff"
        product="EQ"
        productColor="var(--spectrum-cyan)"
        filename="ZandersEQ.vst3"
        tag="4 BANDS"
        tagColor="var(--spectrum-cyan)"
      >
        <span data-testid="eq-well">x</span>
      </DeviceModule>,
    );

    const well = screen.getByTestId("eq-well").parentElement as HTMLElement;
    // With the engine active the well advertises the double-click hint.
    expect(well).toHaveAttribute("title", "Double-click to open the plugin editor");

    fireEvent.doubleClick(well);
    expect(invoked).toContain("deviceOpenEditor");
  });
});
