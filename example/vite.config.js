import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "./dtcg.js";

const root = dirname(fileURLToPath(import.meta.url));

// Compile the DTCG token source to CSS custom properties as part of this build.
// The substrate owns token compilation — no external tool is required to build.
function dtcgTokens() {
  const src = resolve(root, "src/tokens.json");
  const out = resolve(root, "src/tokens.css");
  const build = () => writeFileSync(out, compile(readFileSync(src, "utf8")));
  return {
    name: "dtcg-tokens",
    buildStart() {
      build();
    },
    configureServer(server) {
      build();
      server.watcher.add(src);
      server.watcher.on("change", (file) => {
        if (resolve(file) === src) {
          build();
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

// The built preview is served under a sub-path by the design server, so use a
// relative base ("./"). Output lands in preview/.
export default defineConfig({
  base: "./",
  plugins: [dtcgTokens(), react()],
  build: {
    outDir: "preview",
    emptyOutDir: true,
  },
});
