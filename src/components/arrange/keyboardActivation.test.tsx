// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TrackHeader } from "./TrackHeader";
import { GroupHeader } from "./GroupHeader";
import { MasterBar } from "./MasterBar";
import { useDawStore, type DawState } from "../../store/useDawStore";

// These rows/wrappers are ARIA "button" surfaces (they wrap interactive controls
// or contain nested buttons, so they can't be native <button>s). Each carries an
// Enter/Space onKeyDown — the rows activate, the control wrappers swallow the key
// so the parent row doesn't. This exercises those keyboard handlers.

let snap: Partial<DawState>;
beforeEach(() => {
  const s = useDawStore.getState();
  snap = { selTrack: s.selTrack, rackOpen: s.rackOpen, sendsOpen: { ...s.sendsOpen } };
});
afterEach(() => {
  useDawStore.setState(snap);
});

/** Press Enter then Space on every ARIA "button" surface in a subtree. */
const pressAll = (root: HTMLElement) => {
  root.querySelectorAll('[role="button"]').forEach((el) => {
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: " " });
  });
};

describe("keyboard activation of role=button surfaces", () => {
  it("TrackHeader: Enter/Space on the row selects the track; control wrappers swallow it", () => {
    const track = useDawStore.getState().tracks[0];
    useDawStore.setState({ sendsOpen: { [track.id]: true } }); // render the SENDS wrappers too
    const { container } = render(<TrackHeader track={track} />);
    pressAll(container);
    expect(useDawStore.getState().selTrack).toBe(track.id);
  });

  it("GroupHeader: Enter/Space on the row opens the group chain", () => {
    const g = useDawStore.getState().groups[0];
    const { container } = render(<GroupHeader g={g} />);
    pressAll(container);
    expect(useDawStore.getState().selTrack).toBe(g.id);
    expect(useDawStore.getState().rackOpen).toBe(true);
  });

  it("MasterBar: Enter/Space on the master header opens the master chain", () => {
    const { container } = render(<MasterBar tracksRight={false} />);
    pressAll(container);
    expect(useDawStore.getState().selTrack).toBe("master");
    expect(useDawStore.getState().rackOpen).toBe(true);
  });
});
