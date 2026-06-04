// ds-footer — page footer. Attributes: brand, note. Links via JS property:
//   el.links = [{ label, href }];
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    footer {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-md, 1rem);
      padding: var(--space-xl, 3rem) var(--space-lg, 1.75rem);
      border-top: var(--border-bold, 2px) solid var(--color-ink, #1a1714);
      color: var(--color-muted, #6f655a);
    }
    .brand { font: 600 var(--size-step-1, 1.33rem)/1 var(--font-display, serif); color: var(--color-ink, #1a1714); }
    .note { font-size: var(--size-step--1, 0.82rem); }
    .links { display: flex; gap: var(--space-md, 1rem); flex-wrap: wrap; }
    a { text-decoration: none; color: var(--color-muted, #6f655a); font-size: var(--size-step-0, 1rem); }
    a:hover { color: var(--color-accent, #e4572e); }
  </style>
  <footer part="footer">
    <div>
      <div class="brand" part="brand"></div>
      <div class="note" part="note"></div>
    </div>
    <div class="links"></div>
  </footer>
`;

class DsFooter extends HTMLElement {
  static get observedAttributes() { return ["brand", "note"]; }
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
    this.shadowRoot.querySelector(".note").textContent = this.getAttribute("note") || "";
    this.shadowRoot.querySelector(".links").innerHTML = this._links
      .map((l) => `<a href="${l.href || "#"}">${l.label}</a>`)
      .join("");
  }
}
customElements.define("ds-footer", DsFooter);
