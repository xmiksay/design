// ds-stat — a single metric with optional delta.
// Attributes: label, value, delta, trend ("up" | "down").
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .stat {
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      padding: var(--space-lg, 1.75rem);
    }
    .label {
      font: 700 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--color-muted, #6f655a);
      margin: 0 0 var(--space-sm, 0.625rem);
    }
    .value {
      font: 600 var(--size-step-3, 2.36rem)/1 var(--font-display, serif);
      color: var(--color-ink, #1a1714);
    }
    .delta {
      display: inline-block;
      margin-top: var(--space-sm, 0.625rem);
      font: 600 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif);
    }
    :host([trend="up"]) .delta { color: var(--color-success, #2f7d4f); }
    :host([trend="down"]) .delta { color: var(--color-danger, #c0392b); }
    .delta[hidden] { display: none; }
  </style>
  <div class="stat" part="stat">
    <p class="label" part="label"></p>
    <div class="value" part="value"></div>
    <span class="delta" part="delta" hidden></span>
  </div>
`;

class DsStat extends HTMLElement {
  static get observedAttributes() { return ["label", "value", "delta", "trend"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") || "";
    this.shadowRoot.querySelector(".value").textContent = this.getAttribute("value") || "";
    const delta = this.shadowRoot.querySelector(".delta");
    const d = this.getAttribute("delta");
    const arrow = this.getAttribute("trend") === "down" ? "▾" : "▴";
    delta.textContent = d ? `${arrow} ${d}` : "";
    delta.hidden = !d;
  }
}
customElements.define("ds-stat", DsStat);
