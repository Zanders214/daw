import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

/**
 * Surface uncaught errors on-screen. A JUCE WebView has no visible console, and
 * an unhandled render/effect error otherwise unmounts React to a blank (black)
 * window with no clue why. This overlay covers async/effect/global errors; the
 * ErrorBoundary below covers errors thrown during render.
 */
function showFatal(message: string): void {
  let el = document.getElementById("zd-fatal");
  if (!el) {
    el = document.createElement("div");
    el.id = "zd-fatal";
    el.style.cssText =
      "position:fixed;inset:0;z-index:99999;overflow:auto;padding:24px;margin:0;" +
      "background:#0b0c10;color:#ff6b6b;font:13px/1.5 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;";
    document.body.appendChild(el);
  }
  el.textContent = `Zanders DAW hit an error:\n\n${message}`;
}

window.addEventListener("error", (e) => showFatal(`${e.message}\n${e.error?.stack ?? ""}`));
window.addEventListener("unhandledrejection", (e) =>
  showFatal(`Unhandled promise rejection:\n${String((e.reason && e.reason.stack) || e.reason)}`),
);

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    showFatal(`${error.message}\n${error.stack ?? ""}`);
  }
  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
