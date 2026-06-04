import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The built preview is served under a sub-path (e.g. /preview/) by the design
// server, so use a relative base ("./") to keep asset URLs mount-agnostic.
// Output lands in preview/ — the committed rendered artifact of the substrate.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "preview",
    emptyOutDir: true,
  },
});
