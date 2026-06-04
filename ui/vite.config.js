import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// The SPA is embedded into the Rust binary and served from the site root, so
// emit assets with absolute `/assets/...` paths (default base "/"). Output goes
// to ui/dist, which rust-embed bakes in at compile time.
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
