import { useDawStore } from "./store/useDawStore";
import { useTransportLoop } from "./hooks/useTransportLoop";
import { useMixerGraph } from "./hooks/useMixerGraph";
import { useEngineBridge } from "./hooks/useEngineBridge";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useResponsiveLayout } from "./hooks/useResponsiveLayout";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { TransportBar } from "./components/TransportBar";
import { Browser } from "./components/Browser";
import { Arrange } from "./components/arrange/Arrange";
import { DeviceChain } from "./components/devices/DeviceChain";
import { Settings } from "./components/Settings";
import { Sessions } from "./components/Sessions";
import { PianoRoll } from "./components/PianoRoll";

export function App() {
  useTransportLoop();
  useMixerGraph();
  useEngineBridge();
  useSessionPersistence();
  useResponsiveLayout();
  useGlobalKeys();
  const theme = useDawStore((s) => s.theme);

  return (
    <div
      className="zd-stage"
      data-theme={theme}
      style={{
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
      <PianoRoll />
    </div>
  );
}
