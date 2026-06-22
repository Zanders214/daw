// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Keyboard } from "./Keyboard";

/**
 * The Keyboard renders plain <div> keys with no ARIA roles, so we reach into
 * the rendered container to enumerate them. White keys use flex:"1 1 0";
 * black keys use position:"absolute". We split on that to count each group.
 */
function renderKeyboard(props: React.ComponentProps<typeof Keyboard> = {}) {
  const { container } = render(<Keyboard {...props} />);
  const root = container.firstElementChild as HTMLDivElement;
  const keys = Array.from(root.children) as HTMLDivElement[];
  const whites = keys.filter((k) => k.style.position !== "absolute");
  const blacks = keys.filter((k) => k.style.position === "absolute");
  return { root, keys, whites, blacks };
}

describe("Keyboard", () => {
  it("renders a relative flex container with the requested number of white keys", () => {
    const { root, whites } = renderKeyboard({ whites: 15 });
    expect(root.style.position).toBe("relative");
    expect(root.style.display).toBe("flex");
    expect(whites).toHaveLength(15);
  });

  it("derives the correct number of black keys for the default 15 whites", () => {
    // Black keys appear for i in [0..N-2] where i%7 is in {0,1,3,4,5}.
    // For N=15 that is i = 0,1,3,4,5,7,8,10,11,12 => 10 black keys.
    const { blacks } = renderKeyboard({ whites: 15 });
    expect(blacks).toHaveLength(10);
  });

  it("clamps whites below the 7-key minimum up to 7", () => {
    const { whites } = renderKeyboard({ whites: 3 });
    expect(whites).toHaveLength(7);
  });

  it("rounds a fractional whites count", () => {
    const { whites } = renderKeyboard({ whites: 9.6 });
    expect(whites).toHaveLength(10);
  });

  it("fires onPress with the white key's MIDI-ish index on pointer down", () => {
    const onPress = vi.fn();
    const { whites } = renderKeyboard({ whites: 7, onPress });
    // whiteSemis = [0,2,4,5,7,9,11]; first octave indices map 1:1.
    fireEvent.pointerDown(whites[0]);
    expect(onPress).toHaveBeenCalledWith(0);
    fireEvent.pointerDown(whites[3]);
    expect(onPress).toHaveBeenLastCalledWith(5);
    fireEvent.pointerDown(whites[6]);
    expect(onPress).toHaveBeenLastCalledWith(11);
  });

  it("offsets note indices by 12 into the second octave", () => {
    const onPress = vi.fn();
    const { whites } = renderKeyboard({ whites: 9, onPress });
    // i=7 -> floor(7/7)*12 + whiteSemis[0] = 12
    fireEvent.pointerDown(whites[7]);
    expect(onPress).toHaveBeenCalledWith(12);
    // i=8 -> 12 + whiteSemis[1] = 14
    fireEvent.pointerDown(whites[8]);
    expect(onPress).toHaveBeenLastCalledWith(14);
  });

  it("fires onPress for a black key with the sharp index", () => {
    const onPress = vi.fn();
    const { blacks } = renderKeyboard({ whites: 7, onPress });
    // First black key: i=0 -> whiteSemis[0] + 1 = 1
    fireEvent.pointerDown(blacks[0]);
    expect(onPress).toHaveBeenCalledWith(1);
  });

  it("fires onRelease on pointer up", () => {
    const onRelease = vi.fn();
    const { whites } = renderKeyboard({ whites: 7, onRelease });
    fireEvent.pointerUp(whites[2]);
    expect(onRelease).toHaveBeenCalledWith(4);
  });

  it("fires onRelease on pointer leave", () => {
    const onRelease = vi.fn();
    const { whites } = renderKeyboard({ whites: 7, onRelease });
    fireEvent.pointerLeave(whites[1]);
    expect(onRelease).toHaveBeenCalledWith(2);
  });

  it("depresses a key on press and resets it on release", () => {
    const { whites } = renderKeyboard({
      whites: 7,
      whiteFill: "#ffffff",
      whitePress: "#cccccc",
      accent: "#ff0000",
    });
    const key = whites[0];
    fireEvent.pointerDown(key);
    expect(key.style.transform).toBe("translateY(2px)");
    expect(key.style.background).toBe("#cccccc");
    expect(key.style.boxShadow).toContain("#ff0000");

    fireEvent.pointerUp(key);
    expect(key.style.transform).toBe("none");
    expect(key.style.boxShadow).toBe("");
    expect(key.style.background).toBe("#ffffff");
  });

  it("does not throw when no callbacks are supplied", () => {
    const { whites } = renderKeyboard({ whites: 7 });
    expect(() => {
      fireEvent.pointerDown(whites[0]);
      fireEvent.pointerUp(whites[0]);
      fireEvent.pointerLeave(whites[0]);
    }).not.toThrow();
  });

  it("forwards extra HTML attributes and merges custom style onto the root", () => {
    const { container } = render(
      <Keyboard data-testid="kbd" style={{ opacity: "0.5" }} />,
    );
    const root = container.firstElementChild as HTMLDivElement;
    expect(root.getAttribute("data-testid")).toBe("kbd");
    expect(root.style.opacity).toBe("0.5");
    // The component's own base styles still apply alongside the override.
    expect(root.style.position).toBe("relative");
  });
});
