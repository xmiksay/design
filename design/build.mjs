// Token compile step — the only thing that needs running. Reads the DTCG token
// sources and writes the generated CSS custom properties. Zero dependencies.
//
//   node build.mjs      # compile tokens.json (+ tokens.light.json) -> tokens.css
//   npm run tokens      # same, via the package script
//
// The dark palette is the default (:root); the light palette overrides only the
// base colors under [data-theme="light"].
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "./dtcg.js";

const root = dirname(fileURLToPath(import.meta.url));
const out = resolve(root, "src/tokens.css");

const dark = compile(readFileSync(resolve(root, "src/tokens.json"), "utf8"), ":root");
const light = compile(readFileSync(resolve(root, "src/tokens.light.json"), "utf8"), '[data-theme="light"]');

const css =
  "/* Generated from DTCG tokens — do not edit by hand. */\n\n" +
  dark +
  "\n/* Light theme — base color overrides; the semantic layer cascades. */\n" +
  light;

writeFileSync(out, css);
console.log(`tokens: src/tokens.json + src/tokens.light.json -> ${out}`);
