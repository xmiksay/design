// ds-tab — the rounded pill tab from the chat switcher.
// Attributes: active, count (shows a badge), closable (shows ×).
// Label via the default <slot>. Emits "close" when × is pressed.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2xs, 0.3rem);
      background: var(--color-bg, #15171c);
      border: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
      border-radius: var(--radius-pill, 999px);
      padding: var(--space-3xs, 0.2rem) var(--space-2xs, 0.3rem) var(--space-3xs, 0.2rem) var(--space-md, 0.7rem);
      font: 400 var(--size-step-0, 0.72rem)/1 var(--font-mono, monospace);
      color: var(--color-muted, #8b93a3);
      cursor: pointer;
    }
    :host([active]) .tab { border-color: var(--color-accent, #6ee7b7); color: var(--color-text, #e7e9ee); }
    .count {
      font: 700 var(--size-step--1, 0.66rem)/1.6 var(--font-mono, monospace);
      background: var(--color-accent, #6ee7b7);
      color: var(--color-accent-ink, #08130d);
      border-radius: var(--radius-pill, 999px);
      padding: 0 var(--space-xs, 0.4rem);
    }
    .count:empty { display: none; }
    .close {
      background: transparent; border: none; cursor: pointer;
      color: var(--color-muted, #8b93a3);
      font-size: 0.95rem; line-height: 1; padding: 0 0.15rem; border-radius: 50%;
    }
    .close:hover { color: var(--color-danger, #f87171); }
    .close:not(.on) { display: none; }
  </style>
  <span class="tab" part="tab">
    <span class="label"><slot></slot></span>
    <span class="count" part="count"></span>
    <button class="close" part="close" aria-label="Close">×</button>
  </span>
`;

class DsTab extends HTMLElement {
  static get observedAttributes() { return ["active", "count", "closable"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this.shadowRoot.querySelector(".close").addEventListener("click", (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent("close", { bubbles: true }));
    });
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector(".count").textContent = this.getAttribute("count") || "";
    this.shadowRoot.querySelector(".close").classList.toggle("on", this.hasAttribute("closable"));
  }
}
customElements.define("ds-tab", DsTab);
