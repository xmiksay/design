# Convention — Components

Components are authored as **Web Components** (native custom elements). This is the
load-bearing decision that keeps the substrate stack-neutral: no framework, no
build step is required to render a component.

## Authoring rules

- One component per file in `components/`, named `ds-<name>.js`.
- Define a custom element whose tag is `ds-<name>` (always include a hyphen — the
  custom-elements spec requires it).
- Use **shadow DOM** for encapsulation (`attachShadow({ mode: "open" })`).
- Style **only** from token CSS variables, each with a sane literal fallback:
  `var(--button-bg, #e4572e)`. CSS custom properties inherit through the shadow
  boundary, so tokens reach the component automatically.
- Never hard-code a brand value that a token already defines.
- Expose styleable internals with `part="…"` and content holes with `<slot>`.

## Example shape

```js
const template = document.createElement("template");
template.innerHTML = `
  <style>:host { display: inline-block } /* … use var(--token, fallback) … */</style>
  <button part="button"><slot></slot></button>
`;
class DsThing extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" })
    .append(template.content.cloneNode(true)); }
}
customElements.define("ds-thing", DsThing);
```

## Data

Attributes and `<slot>`s cover simple, declarative content. For **array or object
data** (table rows, accordion panels, nav links) expose a JS **property** instead —
`el.items = […]`, `el.data = {…}` — and re-render in its setter. Keep a matching
getter so the value round-trips.

## Previewing

There is no build. The pages in `preview/` are plain HTML served as-is; each loads
tokens + page CSS via `<link>` and its components via a native ES-module
`<script type="module">`. Three outputs:

- `preview/index.html` (`src/main.js`) — the landing/overview page.
- `preview/components.html` (`src/gallery.js`) — the gallery: one labelled specimen
  per component, each fed with mock data.
- `preview/layout.html` (`src/layout.js`) — the components composed into one
  realistic page.

When you add a component: register it in `components/index.js`, give it sample
values in `src/mock.js`, and add a specimen to `src/gallery.js` (place it on
`preview/layout.html` too if it belongs in the composed view). No bundler step —
just reload the page.
