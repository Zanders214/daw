import { DeviceModule } from "./DeviceModule";

/** Reserved slot for the ZandersEQ VST3 — placeholder frequency-response UI. */
export function ZandersEQ() {
  return (
    <DeviceModule
      device="eq"
      accent="#34d8ff"
      product="EQ"
      productColor="var(--spectrum-cyan)"
      filename="ZandersEQ.vst3"
      tag="4 BANDS"
      tagColor="var(--spectrum-cyan)"
      wellStyle={{ overflow: "hidden" }}
    >
      <svg
        viewBox="0 0 320 118"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <line x1="0" y1="59" x2="320" y2="59" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1="80" y1="0" x2="80" y2="118" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="160" y1="0" x2="160" y2="118" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="240" y1="0" x2="240" y2="118" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <path
          d="M0,86 C50,86 60,30 110,30 C150,30 150,80 200,80 C250,80 260,44 320,44"
          fill="none"
          stroke="url(#eqgrad)"
          strokeWidth="2.5"
          style={{ filter: "drop-shadow(0 0 6px rgba(120,160,255,0.5))" }}
        />
        <defs>
          <linearGradient id="eqgrad" x1="0" y1="0" x2="320" y2="0">
            <stop offset="0" stopColor="#34d8ff" />
            <stop offset="0.5" stopColor="#8b7bff" />
            <stop offset="1" stopColor="#ffc24b" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="30" r="4" fill="#8b7bff" style={{ filter: "drop-shadow(0 0 5px #8b7bff)" }} />
        <circle cx="240" cy="52" r="4" fill="#ffc24b" style={{ filter: "drop-shadow(0 0 5px #ffc24b)" }} />
      </svg>
    </DeviceModule>
  );
}
