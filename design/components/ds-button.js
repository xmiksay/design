// ds-button — the tool's action button.
// Attributes: variant ("solid" | "ghost" | "danger"), disabled.
// solid = mint fill (primary). ghost = bordered, hovers to accent.
// danger = bordered, hovers to danger. Content via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    button {
      font: 700 var(--size-step-1, 0.82rem)/1 var(--font-sans, sans-serif);
      padding: var(--space-xs, 0.4rem) var(--space-md, 0.7rem);
      border-radius: var(--radius-md, 7px);
      border: var(--border-hairline, 1px) solid transparent;
      background: var(--button-bg, #6ee7b7);
      color: var(--button-fg, #08130d);
      cursor: pointer;
      transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
    }
    button.v-ghost {
      background: var(--color-bg, #15171c);
      color: var(--button-ghost, #e7e9ee);
      border-color: var(--color-border, #2a2e38);
      font-weight: 600;
    }
    button.v-ghost:hover:not(:disabled) {
      border-color: var(--color-accent, #6ee7b7);
      color: var(--color-accent, #6ee7b7);
    }
    button.v-danger {
      background: var(--color-bg, #15171c);
      color: var(--color-muted, #8b93a3);
      border-color: var(--color-border, #2a2e38);
      font-weight: 600;
    }
    button.v-danger:hover:not(:disabled) {
      border-color: var(--color-danger, #f87171);
      color: var(--color-danger, #f87171);
    }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid var(--color-accent, #6ee7b7); outline-offset: 2px; }
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
