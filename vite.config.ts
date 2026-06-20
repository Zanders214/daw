import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// @tauri-apps/cli drives this dev server; the fixed port keeps the Tauri
// window pointed at a stable URL during development.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Prevent Vite from obscuring Rust errors during `tauri dev`.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      // Tauri's own source lives outside the web app.
      ignored: ["**/src-tauri/**"],
    },
  },
});
