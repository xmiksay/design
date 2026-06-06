// ds-card — a panel surface, like the tool's windows and menus.
// Attributes: eyebrow, heading. Body content via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    article {
      background: var(--color-panel, #1c1f26);
      border: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
      border-radius: var(--radius-lg, 9px);
      padding: var(--space-lg, 1rem);
      height: 100%;
      box-sizing: border-box;
    }
    .eyebrow {
      font: 400 var(--size-step--1, 0.66rem)/1 var(--font-mono, monospace);
      letter-spacing: var(--tracking-label, 0.14em);
      text-transform: uppercase;
      color: var(--color-accent, #6ee7b7);
      margin: 0 0 var(--space-sm, 0.5rem);
    }
    .eyebrow:empty { display: none; }
    h3 {
      font: 700 var(--size-step-3, 1.1rem)/var(--leading-snug, 1.3) var(--font-sans, sans-serif);
      color: var(--color-text, #e7e9ee);
      margin: 0 0 var(--space-sm, 0.5rem);
    }
    h3:empty { display: none; }
    .body {
      font: 400 var(--size-step-2, 0.86rem)/var(--leading-normal, 1.5) var(--font-sans, sans-serif);
      color: var(--color-muted, #8b93a3);
    }
    ::slotted(*) { margin: 0; }
  </style>
  <article part="card">
    <p class="eyebrow" part="eyebrow"></p>
    <h3 part="heading"></h3>
    <div class="body"><slot></slot></div>
  </article>
`;

class DsCard extends HTMLElement {
  static get observedAttributes() { return ["eyebrow", "heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector(".eyebrow").textContent = this.getAttribute("eyebrow") || "";
    this.shadowRoot.querySelector("h3").textContent = this.getAttribute("heading") || "";
  }
}
customElements.define("ds-card", DsCard);
