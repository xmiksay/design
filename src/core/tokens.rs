//! DTCG → CSS custom properties compiler.
//!
//! Source of truth is lean [DTCG](https://www.designtokens.org/) JSON: a tree of
//! groups and tokens, where a *token* is any object carrying a `$value` key and a
//! *group* is any other object. The token's CSS variable name is its dotted path
//! joined by `-` and prefixed with `--` (e.g. `color.brand.primary` →
//! `--color-brand-primary`). Alias values of the form `{color.brand.primary}` are
//! rewritten to `var(--color-brand-primary)`, including aliases embedded inside a
//! larger string value.
//!
//! Composite `$value`s (objects/arrays — shadows, typography, …) are out of scope
//! for v1 and are skipped with a logged warning; scalar string/number/boolean
//! tokens cover the Phase-0 substrate.

use serde_json::Value;
use std::collections::BTreeSet;
use std::fmt::Write as _;

/// A single resolved token: its CSS variable name (without the leading `--`)
/// and its CSS value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    /// Variable name without the `--` prefix, e.g. `color-brand-primary`.
    pub var_name: String,
    /// CSS value with any aliases already rewritten to `var(--…)`.
    pub value: String,
}

/// Compile a DTCG JSON document into a `:root { … }` CSS custom-properties block.
pub fn compile_str(json: &str) -> anyhow::Result<String> {
    let root: Value = serde_json::from_str(json)?;
    let tokens = collect(&root);
    Ok(render(&tokens))
}

/// Collect tokens from a parsed DTCG document, in document order, with aliases
/// resolved to `var(--…)` references.
pub fn collect(root: &Value) -> Vec<Token> {
    // First pass: gather every token path so aliases can be validated.
    let mut paths = BTreeSet::new();
    walk_paths(root, &mut Vec::new(), &mut paths);

    // Second pass: emit tokens in document order.
    let mut out = Vec::new();
    walk_tokens(root, &mut Vec::new(), &paths, &mut out);
    out
}

fn is_meta(key: &str) -> bool {
    key.starts_with('$')
}

/// Does this object node represent a token (has `$value`) rather than a group?
fn is_token(map: &serde_json::Map<String, Value>) -> bool {
    map.contains_key("$value")
}

fn var_name(path: &[String]) -> String {
    path.join("-")
}

fn walk_paths(node: &Value, path: &mut Vec<String>, out: &mut BTreeSet<String>) {
    let Some(map) = node.as_object() else { return };
    if is_token(map) {
        out.insert(path.join("."));
        return;
    }
    for (key, child) in map {
        if is_meta(key) {
            continue;
        }
        path.push(key.clone());
        walk_paths(child, path, out);
        path.pop();
    }
}

fn walk_tokens(
    node: &Value,
    path: &mut Vec<String>,
    paths: &BTreeSet<String>,
    out: &mut Vec<Token>,
) {
    let Some(map) = node.as_object() else { return };
    if is_token(map) {
        match map.get("$value") {
            Some(value) => {
                if let Some(rendered) = scalar_value(value) {
                    out.push(Token {
                        var_name: var_name(path),
                        value: resolve_aliases(&rendered, paths),
                    });
                } else {
                    tracing::warn!(
                        token = %path.join("."),
                        "skipping composite token: only scalar $value is supported in v1"
                    );
                }
            }
            None => {}
        }
        return;
    }
    for (key, child) in map {
        if is_meta(key) {
            continue;
        }
        path.push(key.clone());
        walk_tokens(child, path, paths, out);
        path.pop();
    }
}

/// Render a scalar JSON value to its CSS text form. Returns `None` for composite
/// values (objects/arrays).
fn scalar_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Null => Some(String::new()),
        Value::Array(_) | Value::Object(_) => None,
    }
}

/// Rewrite `{a.b.c}` alias references into `var(--a-b-c)`. A reference to an
/// unknown path is left verbatim and logged.
fn resolve_aliases(input: &str, paths: &BTreeSet<String>) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close)
                if !after[..close].is_empty()
                    && after[..close]
                        .chars()
                        .all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') =>
            {
                let inner = &after[..close];
                if paths.contains(inner) {
                    let _ = write!(out, "var(--{})", inner.replace('.', "-"));
                } else {
                    tracing::warn!(reference = %inner, "alias references unknown token; leaving verbatim");
                    let _ = write!(out, "{{{inner}}}");
                }
                rest = &after[close + 1..];
            }
            // Not a well-formed alias: keep the brace literally and continue.
            _ => {
                out.push('{');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Render collected tokens to a `:root { … }` block.
pub fn render(tokens: &[Token]) -> String {
    let mut css = String::from("/* Generated from DTCG tokens — do not edit by hand. */\n:root {\n");
    for token in tokens {
        let _ = writeln!(css, "  --{}: {};", token.var_name, token.value);
    }
    css.push_str("}\n");
    css
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_scalars_and_aliases() {
        let json = r##"{
            "color": {
                "$type": "color",
                "brand": { "primary": { "$value": "#5b21b6" } },
                "text":  { "$value": "{color.brand.primary}" }
            },
            "space": { "md": { "$type": "dimension", "$value": "16px" } }
        }"##;
        let css = compile_str(json).unwrap();
        assert!(css.contains("--color-brand-primary: #5b21b6;"));
        assert!(css.contains("--color-text: var(--color-brand-primary);"));
        assert!(css.contains("--space-md: 16px;"));
    }

    #[test]
    fn unknown_alias_left_verbatim() {
        let json = r#"{ "a": { "$value": "{missing.token}" } }"#;
        let css = compile_str(json).unwrap();
        assert!(css.contains("--a: {missing.token};"));
    }

    #[test]
    fn skips_composite_value() {
        let json = r#"{ "shadow": { "$value": { "offsetX": "0", "blur": "4px" } } }"#;
        let css = compile_str(json).unwrap();
        assert!(!css.contains("--shadow"));
    }
}
