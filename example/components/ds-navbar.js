// ds-navbar — top navigation bar. Attributes: brand. Links via JS property:
//   el.links = [{ label, href, active }];  Actions via the "actions" slot.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    nav {
      display: flex;
      align-items: center;
      gap: var(--space-lg, 1.75rem);
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
    }
    .brand {
      font: 600 var(--size-step-1, 1.33rem)/1 var(--font-display, serif);
      color: var(--color-ink, #1a1714);
    }
    .links { display: flex; gap: var(--space-md, 1rem); flex: 1; flex-wrap: wrap; }
    a {
      text-decoration: none;
      color: var(--color-muted, #6f655a);
      font: 600 var(--size-step-0, 1rem)/1 var(--font-body, sans-serif);
      padding: var(--space-xs, 0.375rem) 0;
      border-bottom: var(--border-bold, 2px) solid transparent;
    }
    a:hover { color: var(--color-ink, #1a1714); }
    a.active { color: var(--color-accent, #e4572e); border-bottom-color: var(--color-accent, #e4572e); }
    .actions { display: flex; gap: var(--space-sm, 0.625rem); }
  </style>
  <nav part="nav">
    <span class="brand" part="brand"></span>
    <div class="links"></div>
    <div class="actions"><slot name="actions"></slot></div>
  </nav>
`;

class DsNavbar extends HTMLElement {
  static get observedAttributes() { return ["brand"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._links = [];
  }
  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._render(); }
  set links(value) { this._links = value || []; this._render(); }
  get links() { return this._links; }
  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelector(".brand").textContent = this.getAttribute("brand") || "";
    this.shadowRoot.querySelector(".links").innerHTML = this._links
      .map((l) => `<a class="${l.active ? "active" : ""}" href="${l.href || "#"}">${l.label}</a>`)
      .join("");
  }
}
customElements.define("ds-navbar", DsNavbar);
