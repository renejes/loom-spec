/**
 * Vite build config for the **standalone HTML export** flavour of the view.
 *
 * Differs from `vite.config.ts` in two ways:
 *
 * 1. Single chunk (`manualChunks: () => "all"`). React.lazy(import(...)) in
 *    App.tsx normally produces a separate file that gets fetched on demand.
 *    In an export embedded into a single HTML there's nothing to fetch from,
 *    so we force everything into one chunk; the lazy import resolves
 *    synchronously from the already-loaded code.
 * 2. Output goes to `dist/view-export/`. The regular dev/prod build still
 *    lands in `dist/view/`.
 *
 * Mode detection (`isExportMode()`) is runtime, not compile-time — the same
 * source code is built twice with different bundling rules.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../../dist/view-export"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: () => "all",
        // Stable filenames make the CLI's inline-into-html step simpler.
        entryFileNames: "assets/bundle.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: (info) => {
          if (info.name?.endsWith(".css")) return "assets/bundle.css";
          return "assets/[name][extname]";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
