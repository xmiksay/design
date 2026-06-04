// Token compile step — the only thing that needs running. Reads the DTCG token
// source and writes the generated CSS custom properties. Zero dependencies: it
// uses the substrate's own dtcg.js compiler and Node's stdlib only.
//
//   node build.mjs            # compile src/tokens.json -> src/tokens.css
//   npm run tokens            # same, via the package script
//
// The DTCG format is the contract, not this script — any DTCG compiler can
// produce the same output (see conventions/tokens.md).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { compile } from "./dtcg.js";

const root = dirname(fileURLToPath(import.meta.url));
const src = resolve(root, "src/tokens.json");
const out = resolve(root, "src/tokens.css");

writeFileSync(out, compile(readFileSync(src, "utf8")));
console.log(`tokens: ${src} -> ${out}`);
