// ds-tooltip — hover/focus hint around a trigger.
// Attributes: text, placement ("top" | "bottom"). Trigger via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; position: relative; }
    .bubble {
      position: absolute;
      left: 50%;
      transform: translateX(-50%) translateY(-0.35rem);
      bottom: calc(100% + 0.4rem);
      background: var(--color-ink, #1a1714);
      color: var(--color-surface, #fbf8f1);
      font: var(--size-step--1, 0.82rem) var(--font-body, sans-serif);
      padding: var(--space-xs, 0.375rem) var(--space-sm, 0.625rem);
      border-radius: var(--radius-sm, 4px);
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease, transform 120ms ease;
      z-index: 40;
    }
    .bubble::after {
      content: "";
      position: absolute;
      top: 100%; left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: var(--color-ink, #1a1714);
    }
    :host([placement="bottom"]) .bubble { bottom: auto; top: calc(100% + 0.4rem); transform: translateX(-50%) translateY(0.35rem); }
    :host([placement="bottom"]) .bubble::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: var(--color-ink, #1a1714); }
    :host(:hover) .bubble, :host(:focus-within) .bubble { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
  <slot></slot>
  <span class="bubble" part="bubble" role="tooltip"></span>
`;

class DsTooltip extends HTMLElement {
  static get observedAttributes() { return ["text"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector(".bubble").textContent = this.getAttribute("text") || "";
  }
}
customElements.define("ds-tooltip", DsTooltip);
