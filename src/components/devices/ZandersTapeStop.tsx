import { useDawStore } from "../../store/useDawStore";
import { DeviceModule } from "./DeviceModule";

/** The spinning tape overlay (live: subscribes to the rAF-driven reel angle). */
function ReelSpin() {
  const reel = useDawStore((s) => s.reel);
  return (
    <div
      style={{
        position: "absolute",
        inset: 18,
        borderRadius: "50%",
        transform: `rotate(${reel}deg)`,
        background:
          "repeating-conic-gradient(from 0deg, rgba(255,255,255,.22) 0deg 4deg, transparent 4deg 30deg)",
      }}
    />
  );
}

function Reel({ core }: Readonly<{ core: string }>) {
  return (
    <div style={{ position: "relative", width: 64, height: 64 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "repeating-radial-gradient(circle,#1c2129 0 2px,#12161c 2px 4px)",
          boxShadow: "inset 0 0 9px rgba(0,0,0,.6)",
        }}
      />
      <ReelSpin />
      <div
        style={{
          position: "absolute",
          inset: 24,
          borderRadius: "50%",
          background: core,
          boxShadow: "0 0 9px rgba(52,216,255,.45)",
        }}
      />
    </div>
  );
}

/** Reserved slot for the ZandersTapeStop VST3 — placeholder reel-housing UI. */
export function ZandersTapeStop() {
  return (
    <DeviceModule
      device="tape"
      accent="#34d8ff"
      product="TapeStop"
      productColor="var(--spectrum-cyan)"
      filename="ZandersTapeStop.vst3"
      tag="WIND-DOWN"
      tagColor="var(--text-3)"
      wellStyle={{ display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 18px" }}
    >
      <Reel core="radial-gradient(circle at 38% 30%,#34d8ff,#8b7bff)" />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 18,
          right: 18,
          height: 2,
          background: "var(--layer-2)",
          transform: "translateY(-50%)",
        }}
      />
      <Reel core="radial-gradient(circle at 38% 30%,#ff5fa8,#ffc24b)" />
    </DeviceModule>
  );
}
