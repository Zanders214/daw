import { defineConfig } from "vitest/config";
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
  // Vitest: unit tests for pure logic, with V8 coverage exported as lcov for
  // SonarQube Cloud to import (see sonar-project.properties).
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/main.tsx",
        "src/**/*.d.ts",
        "src/data/**",
        "src/styles/**",
        "src/test/**",
      ],
    },
  },
});
