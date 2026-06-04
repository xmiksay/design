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

## Previewing

Add a usage example to `preview/index.html` and import the component module there.
The preview page is what the live view renders.
