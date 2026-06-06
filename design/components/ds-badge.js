// ds-badge — the small mono pill used for counts and statuses.
// Attributes: tone ("accent" | "neutral" | "danger").
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    span {
      font: 700 var(--size-step--1, 0.66rem)/1.6 var(--font-mono, monospace);
      padding: 0 var(--space-xs, 0.4rem);
      border-radius: var(--radius-pill, 999px);
      color: var(--color-accent-ink, #08130d);
      background: var(--color-accent, #6ee7b7);
      white-space: nowrap;
    }
    span.t-neutral {
      color: var(--color-muted, #8b93a3);
      background: transparent;
      border: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
    }
    span.t-danger {
      color: var(--color-accent-ink, #08130d);
      background: var(--color-danger, #f87171);
    }
  </style>
  <span part="badge"><slot></slot></span>
`;

class DsBadge extends HTMLElement {
  static get observedAttributes() { return ["tone"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._el = this.shadowRoot.querySelector("span");
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() { this._el.className = `t-${this.getAttribute("tone") || "accent"}`; }
}
customElements.define("ds-badge", DsBadge);
