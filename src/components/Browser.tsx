import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../store/useDawStore";
import { LIBRARY, KIND_COLOR } from "../data/seed";
import { hexA } from "../lib/color";
import type { BrowserTab } from "../types";

const TABS: [BrowserTab, string][] = [
  ["all", "ALL"],
  ["inst", "INST"],
  ["fx", "FX"],
  ["audio", "AUDIO"],
  ["midi", "MIDI"],
  ["preset", "PRESET"],
];

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 9px",
    borderRadius: 7,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.1em",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    ...(active
      ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
      : { background: "var(--layer-1)", color: "var(--text-3)", border: "1px solid var(--layer-3)" }),
  };
}

export function Browser() {
  const { query, tab, browserOpen, onSearch, setTab, toggleBrowser } = useDawStore(
    useShallow((s) => ({
      query: s.query,
      tab: s.tab,
      browserOpen: s.browserOpen,
      onSearch: s.onSearch,
      setTab: s.setTab,
      toggleBrowser: s.toggleBrowser,
    })),
  );

  const categories = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    return LIBRARY.map((cat) => {
      const items = cat.items.filter(
        (it) => (tab === "all" || it.kind === tab) && (!q || it.name.toLowerCase().includes(q)),
      );
      return { ...cat, items };
    }).filter((c) => c.items.length);
  }, [query, tab]);

  if (!browserOpen) {
    return (
      <div
        onClick={toggleBrowser}
        title="Show browser"
        style={{
          width: 36,
          flex: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          paddingTop: 16,
          cursor: "pointer",
          borderRight: "1px solid var(--layer-3)",
          background: "var(--app-surface)",
        }}
      >
        <span style={{ fontSize: 14, color: "var(--text-3)" }}>»</span>
        <span
          style={{
            writingMode: "vertical-rl",
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "var(--text-3)",
            fontWeight: 600,
          }}
        >
          BROWSER
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width: 288,
        flex: "none",
        borderRight: "1px solid var(--layer-3)",
        background: "var(--app-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          padding: "14px 16px 13px",
          borderBottom: "1px solid var(--layer-2)",
          background: "var(--app-surface-2)",
          flex: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--text-2)", fontWeight: 600 }}>
            BROWSER
          </span>
          <button
            type="button"
            onClick={toggleBrowser}
            title="Hide browser"
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: "var(--layer-2)",
              border: "1px solid var(--layer-5)",
              color: "var(--text-3)",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            «
          </button>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            height: 34,
            padding: "0 11px",
            borderRadius: 9,
            background: "var(--well)",
            border: "1px solid var(--layer-3)",
            boxShadow: "var(--inset-top)",
          }}
        >
          <span style={{ color: "var(--text-faint)", fontSize: 13 }}>⌕</span>
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search instruments, FX, MIDI…"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-1)",
              fontFamily: "var(--font-display)",
              fontSize: 12,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 11, flexWrap: "wrap" }}>
          {TABS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={tabStyle(tab === id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      <div className="zd-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {categories.map((cat) => (
          <div key={cat.name} style={{ padding: "13px 13px 3px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, padding: "0 4px" }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: cat.color,
                  boxShadow: `0 0 7px ${cat.color}`,
                  flex: "none",
                }}
              />
              <span style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--text-3)", fontWeight: 600, flex: 1 }}>
                {cat.name}
              </span>
              <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
                {cat.items.length}
              </span>
            </div>
            {cat.items.map((it) => (
              <div
                key={it.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 11px",
                  borderRadius: 8,
                  background: "var(--layer-1)",
                  border: "1px solid transparent",
                  marginBottom: 5,
                  cursor: "grab",
                }}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: cat.color,
                    background: hexA(cat.color, 0.12),
                    border: `1px solid ${hexA(cat.color, 0.3)}`,
                  }}
                >
                  {it.glyph}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "var(--text-2)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {it.name}
                </span>
                <span
                  style={{
                    fontSize: 8.5,
                    fontFamily: "var(--font-mono)",
                    flex: "none",
                    color: KIND_COLOR[it.kind],
                    letterSpacing: "0.04em",
                    padding: "2px 5px",
                    borderRadius: 4,
                    background: hexA(KIND_COLOR[it.kind], 0.1),
                    border: `1px solid ${hexA(KIND_COLOR[it.kind], 0.25)}`,
                  }}
                >
                  {it.kind.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        ))}
        {categories.length === 0 && (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              color: "var(--text-faint)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            No matches
          </div>
        )}
      </div>
    </div>
  );
}
