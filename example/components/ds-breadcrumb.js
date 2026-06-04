// ds-breadcrumb — hierarchical trail. Data via JS property:
//   el.items = [{ label, href }];   (last item is rendered as current)
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    nav { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm, 0.625rem); }
    a, span {
      font: var(--size-step--1, 0.82rem) var(--font-body, sans-serif);
      text-decoration: none;
      color: var(--color-muted, #6f655a);
    }
    a:hover { color: var(--color-accent, #e4572e); }
    span[aria-current] { color: var(--color-ink, #1a1714); font-weight: 600; }
    .sep { color: var(--color-line, #ddd3c2); }
  </style>
  <nav part="nav" aria-label="Breadcrumb"></nav>
`;

class DsBreadcrumb extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._items = [];
  }
  connectedCallback() { this._render(); }
  set items(value) { this._items = value || []; this._render(); }
  get items() { return this._items; }
  _render() {
    if (!this.shadowRoot) return;
    const last = this._items.length - 1;
    this.shadowRoot.querySelector("nav").innerHTML = this._items
      .map((it, i) => {
        const node =
          i === last
            ? `<span aria-current="page">${it.label}</span>`
            : `<a href="${it.href || "#"}">${it.label}</a>`;
        return i < last ? `${node}<span class="sep">/</span>` : node;
      })
      .join("");
  }
}
customElements.define("ds-breadcrumb", DsBreadcrumb);
