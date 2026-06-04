# Convention — Tokens

Design tokens are the **source of truth** for every visual value. They live in
`tokens/` as [DTCG](https://www.designtokens.org/) JSON and compile to CSS custom
properties in `dist/tokens.css`.

## Format

- A **token** is any JSON object with a `$value` key.
- A **group** is any object without `$value`; its non-`$` keys are children.
- `$type` and `$description` are metadata and may sit on tokens or groups.
- Composite `$value`s (objects/arrays — shadows, typography) are **not yet
  supported** by the compiler; use scalar string/number values for now.

## Naming → CSS variable

A token's CSS variable is its dotted path joined by `-`, prefixed with `--`:

```
color.brand.primary   →   --color-brand-primary
space.md              →   --space-md
```

## Aliases

Reference another token with `{dotted.path}`. It compiles to a `var(--…)`
reference, so semantic tokens stay linked to their source:

```json
"button": { "bg": { "$value": "{color.accent}" } }
```

→ `--button-bg: var(--color-accent);`

## Layers

Keep a **core** layer (raw palette, scale) and a **semantic** layer (role-based
names that alias core). Components should consume semantic tokens where possible
so a re-theme touches the semantic layer, not every component.
