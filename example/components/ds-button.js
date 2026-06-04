// ds-button — token-styled action button.
// Attributes: variant ("solid" | "ghost" | "danger"), disabled.
// Content via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    button {
      font: 600 var(--size-step-0, 1rem)/1 var(--font-body, sans-serif);
      letter-spacing: 0.01em;
      padding: var(--space-sm, 0.625rem) var(--space-lg, 1.75rem);
      border-radius: var(--radius-sm, 4px);
      border: var(--border-bold, 2px) solid var(--button-bg, #e4572e);
      background: var(--button-bg, #e4572e);
      color: var(--button-fg, #fbf8f1);
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 3px 3px 0 var(--color-ink, #1a1714); }
    button:active { transform: translateY(0); box-shadow: 1px 1px 0 var(--color-ink, #1a1714); }
    button.v-ghost {
      background: transparent;
      color: var(--button-bg-ghost, #1a1714);
      border-color: var(--color-line, #ddd3c2);
    }
    button.v-ghost:hover { border-color: var(--button-bg-ghost, #1a1714); }
    button.v-danger {
      background: var(--color-danger, #c0392b);
      border-color: var(--color-danger, #c0392b);
      color: #fff;
    }
    button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: none; }
  </style>
  <button part="button"><slot></slot></button>
`;

class DsButton extends HTMLElement {
  static get observedAttributes() { return ["variant", "disabled"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._btn = this.shadowRoot.querySelector("button");
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this._btn.className = `v-${this.getAttribute("variant") || "solid"}`;
    this._btn.disabled = this.hasAttribute("disabled");
  }
}
customElements.define("ds-button", DsButton);
