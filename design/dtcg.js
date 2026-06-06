// DTCG → CSS custom properties compiler (substrate-owned, zero dependencies).
//
// A *token* is any object with a `$value`; a *group* is any other object. A
// token's CSS variable name is its dotted path joined by `-` (e.g.
// `color.brand.primary` → `--color-brand-primary`). Alias values `{a.b.c}` are
// rewritten to `var(--a-b-c)`. Composite ($value objects/arrays) are skipped.
//
// The DTCG format is the contract, not this file — any DTCG compiler can emit
// the same custom properties. This keeps the substrate workable by hand.

const isMeta = (k) => k.startsWith("$");
const isToken = (o) =>
  o && typeof o === "object" && !Array.isArray(o) && "$value" in o;

function collectPaths(node, path, out) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  if (isToken(node)) {
    out.add(path.join("."));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (isMeta(k)) continue;
    collectPaths(v, [...path, k], out);
  }
}

function scalar(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "";
  return null; // composite — skip
}

function resolveAliases(input, paths) {
  let out = "";
  let rest = input;
  for (;;) {
    const i = rest.indexOf("{");
    if (i < 0) {
      out += rest;
      break;
    }
    out += rest.slice(0, i);
    const after = rest.slice(i + 1);
    const j = after.indexOf("}");
    const inner = j >= 0 ? after.slice(0, j) : "";
    if (j >= 0 && inner.length > 0 && /^[A-Za-z0-9._-]+$/.test(inner)) {
      out += paths.has(inner)
        ? `var(--${inner.replace(/\./g, "-")})`
        : `{${inner}}`;
      rest = after.slice(j + 1);
    } else {
      out += "{";
      rest = after;
    }
  }
  return out;
}

function walk(node, path, paths, out) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  if (isToken(node)) {
    const s = scalar(node["$value"]);
    if (s !== null) {
      out.push({ name: path.join("-"), value: resolveAliases(s, paths) });
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (isMeta(k)) continue;
    walk(v, [...path, k], paths, out);
  }
}

export function compile(jsonString, selector = ":root") {
  const root = JSON.parse(jsonString);
  const paths = new Set();
  collectPaths(root, [], paths);
  const tokens = [];
  walk(root, [], paths, tokens);
  let css = `${selector} {\n`;
  for (const t of tokens) css += `  --${t.name}: ${t.value};\n`;
  css += "}\n";
  return css;
}
