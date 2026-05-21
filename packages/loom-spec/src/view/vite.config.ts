import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../../dist/view"),
    emptyOutDir: true,
  },
  server: {
    port: 7777,
    strictPort: true,
    fs: {
      // Allow serving files from the workspace root (so we can read examples/ during dev)
      allow: [resolve(__dirname, "../../../../")],
    },
    proxy: {
      "/api": {
        target: "http://localhost:7778",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
