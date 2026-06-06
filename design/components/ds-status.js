// ds-status — the connection dot used in the chat bar and tab strip:
// a small circle that glows mint when live. Optional label via <slot>.
// Attributes: on.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-flex; align-items: center; gap: var(--space-sm, 0.5rem); }
    .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--color-muted, #8b93a3);
    }
    :host([on]) .dot {
      background: var(--color-accent, #6ee7b7);
      box-shadow: var(--shadow-glow, 0 0 8px #6ee7b7);
    }
    .label {
      font: 400 var(--size-step-0, 0.72rem)/1 var(--font-mono, monospace);
      color: var(--color-muted, #8b93a3);
    }
    :host([on]) .label { color: var(--color-text, #e7e9ee); }
    .label:empty { display: none; }
  </style>
  <span class="dot" part="dot"></span>
  <span class="label" part="label"><slot></slot></span>
`;

class DsStatus extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
}
customElements.define("ds-status", DsStatus);
