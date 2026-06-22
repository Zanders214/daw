import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../store/useDawStore";
import { applySession, buildSession } from "../lib/session";
import { sessionBackend, type SessionListItem } from "../lib/sessionStore";

const BTN_VARIANTS: Record<"primary" | "neutral" | "ghost", React.CSSProperties> = {
  primary: { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)", boxShadow: "0 0 12px var(--accent-glow)" },
  ghost: { background: "transparent", color: "var(--text-3)", border: "1px solid var(--layer-3)" },
  neutral: { background: "var(--layer-2)", color: "var(--text-2)", border: "1px solid var(--layer-5)", boxShadow: "var(--inset-top)" },
};

const btn = (kind: "primary" | "neutral" | "ghost" = "neutral"): React.CSSProperties => ({
  height: 34,
  padding: "0 14px",
  borderRadius: 9,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  ...BTN_VARIANTS[kind],
});

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 34,
  padding: "0 12px",
  borderRadius: 9,
  background: "var(--well)",
  border: "1px solid var(--layer-3)",
  color: "var(--text-1)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  boxShadow: "var(--inset-top)",
};

const sectionStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.18em",
  color: "var(--text-label)",
  fontWeight: 700,
  margin: "22px 0 8px",
};

function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function Sessions() {
  const { open, close, current, setCurrent, newSession } = useDawStore(
    useShallow((s) => ({
      open: s.sessionsOpen,
      close: s.closeSessions,
      current: s.currentSessionName,
      setCurrent: s.setCurrentSessionName,
      newSession: s.newSession,
    })),
  );

  const [list, setList] = useState<SessionListItem[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    setList(await sessionBackend.list());
  }, []);

  useEffect(() => {
    if (open) {
      setName("");
      setStatus("");
      void refresh();
    }
  }, [open, refresh]);

  if (!open) return null;

  const saveAs = async (target: string) => {
    const n = target.trim();
    if (!n) return;
    await sessionBackend.save(n, buildSession(n));
    setCurrent(n);
    setName("");
    setStatus(`Saved “${n}”`);
    await refresh();
  };

  const save = async () => {
    if (current) {
      await sessionBackend.save(current, buildSession(current));
      setStatus(`Saved “${current}”`);
      await refresh();
    } else if (name.trim()) {
      await saveAs(name);
    } else {
      setStatus("Enter a name to save");
    }
  };

  const openSession = async (n: string) => {
    const data = await sessionBackend.load(n);
    if (!data) {
      setStatus(`Could not open “${n}”`);
      return;
    }
    applySession(data);
    setCurrent(n);
    close();
  };

  const remove = async (n: string) => {
    await sessionBackend.remove(n);
    if (n === current) setCurrent(null);
    setStatus(`Deleted “${n}”`);
    await refresh();
  };

  return (
    <div
      role="button"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: 640,
          maxHeight: "86%",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 16,
          border: "1px solid var(--layer-3)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "20px 26px",
            borderBottom: "1px solid var(--layer-2)",
            flex: "none",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--knob-face)",
              border: "1px solid var(--layer-5)",
              boxShadow: "var(--shadow-knob)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              color: "var(--text-2)",
            }}
          >
            ♫
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.02em" }}>
              Sessions
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              {current ? `Current · ${current}` : "Untitled session"}
            </div>
          </div>
          <button type="button" onClick={close} title="Close" style={{ ...btn("neutral"), width: 32, height: 32, padding: 0 }}>
            ✕
          </button>
        </div>

        <div className="zd-scroll" style={{ flex: 1, overflowY: "auto", padding: "2px 26px 24px" }}>
          {/* save / new row */}
          <div style={sectionStyle}>SAVE</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={inputStyle}
              placeholder={current ?? "Session name…"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveAs(name);
              }}
            />
            <button type="button" style={btn("primary")} onClick={() => void save()}>
              {current && !name.trim() ? "SAVE" : "SAVE AS"}
            </button>
            <button type="button" style={btn("neutral")} onClick={() => { newSession(); setStatus("New session"); }}>
              NEW
            </button>
          </div>

          {/* native file dialogs (hosted only) */}
          {sessionBackend.canUseFiles && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={btn("ghost")} onClick={() => void sessionBackend.exportFile(current ?? "Untitled")}>
                ⤓ EXPORT .zdaw
              </button>
              <button type="button" style={btn("ghost")} onClick={() => void sessionBackend.importFile()}>
                ⤒ IMPORT .zdaw
              </button>
            </div>
          )}

          {status && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12, fontFamily: "var(--font-mono)" }}>{status}</div>
          )}

          {/* saved list */}
          <div style={sectionStyle}>SAVED SESSIONS</div>
          {list.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-faint)", padding: "10px 0" }}>No saved sessions yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {list.map((it) => (
                <div
                  key={it.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: it.name === current ? "var(--accent-soft)" : "var(--layer-1)",
                    border: "1px solid " + (it.name === current ? "var(--accent-line)" : "var(--layer-3)"),
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void openSession(it.name)}
                    title="Open"
                    style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                      {fmtDate(it.savedAt) || "—"}
                    </div>
                  </button>
                  <button type="button" style={btn("ghost")} onClick={() => void openSession(it.name)}>
                    OPEN
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    style={{ ...btn("ghost"), width: 34, padding: 0, color: "var(--danger, #ff6b6b)" }}
                    onClick={() => void remove(it.name)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
