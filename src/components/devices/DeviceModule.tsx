import type { CSSProperties, ReactNode } from "react";
import { useDawStore } from "../../store/useDawStore";
import { Wordmark, Badge } from "../../design-system";
import { hexA } from "../../lib/color";
import { engine, engineActive } from "../../lib/engine";
import type { DeviceKey } from "../../types";

export interface DeviceModuleProps {
  device: DeviceKey;
  accent: string;
  product: ReactNode;
  productColor: string;
  filename: string;
  tag: ReactNode;
  tagColor: string;
  /** Extra styling for the 118px display well. */
  wellStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * The docking frame shared by every device in the rack: header (wordmark +
 * VST3 badge + bypass power), a 118px display well, and a mono caption.
 * The reserved Zanders plugins (EQ / TapeStop / PreDrop) mount their UI in
 * the well — this is where the real VST3 editor views will live.
 */
export function DeviceModule({
  device,
  accent,
  product,
  productColor,
  filename,
  tag,
  tagColor,
  wellStyle,
  children,
}: Readonly<DeviceModuleProps>) {
  const on = useDawStore((s) => s.devices[device]);
  const toggleDevice = useDawStore((s) => s.toggleDevice);

  return (
    <div
      style={{
        width: 340,
        flex: "none",
        borderRadius: 14,
        padding: 16,
        background: "var(--panel)",
        border: "1px solid var(--layer-3)",
        boxShadow: on
          ? `0 10px 30px rgba(0,0,0,0.45), inset 0 0 0 1px ${hexA(accent, 0.18)}`
          : "0 10px 30px rgba(0,0,0,0.45)",
        opacity: on ? 1 : 0.5,
        display: "flex",
        flexDirection: "column",
        transition: "opacity var(--dur-base) var(--ease)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Wordmark product={product} color={productColor} size={15} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge>VST3</Badge>
          <button
            type="button"
            onClick={() => toggleDevice(device)}
            title="Bypass"
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              cursor: "pointer",
              border: `1px solid ${on ? hexA(accent, 0.7) : "var(--layer-5)"}`,
              background: on ? accent : "var(--layer-2)",
              boxShadow: on ? `0 0 10px ${hexA(accent, 0.7)}` : "var(--inset-top)",
            }}
          />
        </div>
      </div>

      <div
        onDoubleClick={() => {
          if (engineActive()) engine.device.openEditor(device);
        }}
        title={engineActive() ? "Double-click to open the plugin editor" : undefined}
        style={{
          height: 118,
          borderRadius: 10,
          background: "var(--well)",
          boxShadow: "var(--shadow-window)",
          border: "1px solid var(--layer-2)",
          position: "relative",
          ...wellStyle,
        }}
      >
        {children}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 11 }}>
        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>{filename}</span>
        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: tagColor, letterSpacing: "0.06em" }}>
          {tag}
        </span>
      </div>
    </div>
  );
}
