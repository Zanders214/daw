import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { DeviceModule } from "./DeviceModule";
import { Dial } from "../../design-system";
import { clamp01 } from "../../lib/color";

/** Reserved slot for the ZandersPreDrop VST3 — AMOUNT dial drives a build-up
 * chain (HPF → Reverb → Delay → Riser); the chips track the dial. */
export function ZandersPreDrop() {
  const { preAmount, setPreAmount } = useDawStore(
    useShallow((s) => ({ preAmount: s.preAmount, setPreAmount: s.setPreAmount })),
  );

  const a = preAmount;
  const win = (lo: number, hi: number) => clamp01((a - lo) / (hi - lo));
  const chips = [
    { label: "HPF", value: Math.round(20 * Math.pow(40, Math.pow(a, 1.5))) + " Hz", color: "#34d8ff", on: true },
    { label: "REV", value: Math.round(win(0.2, 1) * 100) + "%", color: "#8b7bff", on: a >= 0.2 },
    { label: "DLY", value: Math.round(win(0.4, 1) * 100) + "%", color: "#ff5fa8", on: a >= 0.4 },
    { label: "RIS", value: Math.round(Math.pow(win(0.6, 1), 2) * 100) + "%", color: "#ffc24b", on: a >= 0.6 },
  ];

  return (
    <DeviceModule
      device="pre"
      accent="#ff5fa8"
      product="PreDrop"
      productColor="var(--spectrum-pink)"
      filename="ZandersPreDrop.vst3"
      tag="BUILD-UP"
      tagColor="var(--spectrum-pink)"
      wellStyle={{ display: "flex", alignItems: "center", gap: 16, padding: "0 18px" }}
    >
      <Dial value={preAmount} onChange={setPreAmount} color="var(--spectrum-pink)" label="AMOUNT" size={30} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {chips.map((ch) => (
          <div key={ch.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: ch.color,
                boxShadow: `0 0 7px ${ch.color}`,
                flex: "none",
                opacity: ch.on ? 1 : 0.3,
              }}
            />
            <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>{ch.label}</span>
            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>{ch.value}</span>
          </div>
        ))}
      </div>
    </DeviceModule>
  );
}
