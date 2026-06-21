import { useEffect, useState } from "react";
import { useDawStore } from "./store/useDawStore";
import { useTransportLoop } from "./hooks/useTransportLoop";
import { useEngineBridge } from "./hooks/useEngineBridge";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { TransportBar } from "./components/TransportBar";
import { Browser } from "./components/Browser";
import { Arrange } from "./components/arrange/Arrange";
import { DeviceChain } from "./components/devices/DeviceChain";
import { Settings } from "./components/Settings";
import { Sessions } from "./components/Sessions";

export function App() {
  useTransportLoop();
  useEngineBridge();
  useSessionPersistence();
  const theme = useDawStore((s) => s.theme);

  // The DAW is authored at a fixed 1920×1080; scale it uniformly to the window.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div
      className="zd-stage"
      data-theme={theme}
      style={{
        transform: `scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        background: "var(--app-bg)",
        color: "var(--text-1)",
        fontFamily: "var(--font-display)",
        userSelect: "none",
      }}
    >
      <TransportBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <Browser />
        <Arrange />
      </div>
      <DeviceChain />
      <Settings />
      <Sessions />
    </div>
  );
}
