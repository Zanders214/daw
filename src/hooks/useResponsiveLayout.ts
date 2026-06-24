import { useEffect } from "react";
import { useDawStore } from "../store/useDawStore";

/**
 * Below this window width the fixed-width browser (288px) crowds the arrange
 * area, so we auto-collapse it to its rail.
 */
export const NARROW_W = 1024;
/**
 * Below this window height the 300px device rack leaves too little room for the
 * arrangement, so we auto-collapse it to its header bar.
 */
export const SHORT_H = 640;

/**
 * Keeps the fluid shell usable at small window sizes by auto-collapsing the
 * browser (when narrow) and the device rack (when short), then restoring each
 * once there's room again.
 *
 * We only ever undo our *own* collapse: if the user manually reopens a panel
 * while the window is still constrained, we drop the pending restore so we
 * don't fight their choice or surprise them by toggling it back later. Mount
 * once. Reads `globalThis.innerWidth/innerHeight`, so it's inert under SSR/test
 * environments without a window.
 */
export function useResponsiveLayout() {
  useEffect(() => {
    // false initially so the first apply() treats a constrained mount as a
    // transition and collapses accordingly.
    let wasNarrow = false;
    let wasShort = false;
    let restoreBrowser = false;
    let restoreRack = false;

    const apply = () => {
      const narrow = globalThis.innerWidth < NARROW_W;
      const short = globalThis.innerHeight < SHORT_H;
      const { browserOpen, rackOpen, toggleBrowser, toggleRack } = useDawStore.getState();

      if (narrow !== wasNarrow) {
        wasNarrow = narrow;
        if (narrow && browserOpen) {
          restoreBrowser = true;
          toggleBrowser();
        } else if (!narrow && restoreBrowser) {
          restoreBrowser = false;
          if (!browserOpen) toggleBrowser();
        }
      }

      if (short !== wasShort) {
        wasShort = short;
        if (short && rackOpen) {
          restoreRack = true;
          toggleRack();
        } else if (!short && restoreRack) {
          restoreRack = false;
          if (!rackOpen) toggleRack();
        }
      }
    };

    apply();
    globalThis.addEventListener("resize", apply);
    return () => globalThis.removeEventListener("resize", apply);
  }, []);
}
