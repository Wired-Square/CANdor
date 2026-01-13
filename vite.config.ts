import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  test: {
    include: ["src/**/*.{test,spec}.ts?(x)"],
    globals: false,
    environment: "node",
  },

  // Optimized build configuration for Tauri desktop app
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          // Core React runtime - loaded by all windows
          'vendor-react': ['react', 'react-dom'],
          // Tauri APIs - loaded by all windows
          'vendor-tauri': [
            '@tauri-apps/api',
            '@tauri-apps/plugin-dialog',
            '@tauri-apps/plugin-opener',
            '@tauri-apps/plugin-store',
          ],
          // State management
          'vendor-zustand': ['zustand'],
          // TOML parsing (used by catalog editor)
          'vendor-toml': ['smol-toml'],
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
