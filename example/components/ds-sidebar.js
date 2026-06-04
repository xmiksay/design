// ds-sidebar — vertical navigation list. Attributes: heading. Items via property:
//   el.items = [{ label, href, active }];   (or { section: "Title" } for a group label)
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    aside {
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      padding: var(--space-md, 1rem);
      min-width: 13rem;
    }
    .heading {
      font: 700 0.7rem/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--color-accent, #e4572e);
      margin: 0 0 var(--space-sm, 0.625rem);
      padding: 0 var(--space-sm, 0.625rem);
    }
    .section {
      font: 700 0.68rem/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-muted, #6f655a);
      margin: var(--space-md, 1rem) var(--space-sm, 0.625rem) var(--space-xs, 0.375rem);
    }
    a {
      display: block;
      text-decoration: none;
      padding: var(--space-sm, 0.625rem) var(--space-sm, 0.625rem);
      border-radius: var(--radius-sm, 4px);
      font: var(--size-step-0, 1rem) var(--font-body, sans-serif);
      color: var(--color-muted, #6f655a);
    }
    a:hover { background: var(--color-surface-2, #f0e9db); color: var(--color-ink, #1a1714); }
    a.active { background: var(--color-accent, #e4572e); color: var(--color-accent-ink, #fbf8f1); }
    [hidden] { display: none; }
  </style>
  <aside part="aside">
    <p class="heading" part="heading" hidden></p>
    <nav></nav>
  </aside>
`;

class DsSidebar extends HTMLElement {
  static get observedAttributes() { return ["heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._items = [];
  }
  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }
  set items(value) { this._items = value || []; this._render(); }
  get items() { return this._items; }
  _render() {
    if (!this.shadowRoot) return;
    const heading = this.shadowRoot.querySelector(".heading");
    heading.textContent = this.getAttribute("heading") || "";
    heading.hidden = !this.getAttribute("heading");
    this.shadowRoot.querySelector("nav").innerHTML = this._items
      .map((it) =>
        it.section
          ? `<p class="section">${it.section}</p>`
          : `<a class="${it.active ? "active" : ""}" href="${it.href || "#"}">${it.label}</a>`,
      )
      .join("");
  }
}
customElements.define("ds-sidebar", DsSidebar);
