/** Empty rack slot — where a dropped .vst3 would be added. */
export function AddDeviceSlot() {
  return (
    <div
      style={{
        width: 200,
        flex: "none",
        borderRadius: 14,
        border: "1.5px dashed var(--layer-5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--text-faint)",
        cursor: "pointer",
        background: "rgba(255,255,255,0.012)",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1.5px solid var(--layer-5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 300,
          color: "var(--text-3)",
        }}
      >
        +
      </div>
      <span style={{ fontSize: 10, letterSpacing: "0.16em", fontWeight: 600 }}>ADD DEVICE</span>
      <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>drop .vst3</span>
    </div>
  );
}
