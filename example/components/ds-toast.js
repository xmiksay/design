// ds-toast — transient notification card (rendered statically for preview).
// Attributes: variant ("info" | "success" | "warning" | "danger"), heading.
// Body via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md, 1rem);
      min-width: 17rem;
      max-width: 24rem;
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-left: var(--border-bold, 2px) solid var(--fg);
      border-radius: var(--radius-md, 10px);
      box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-ink, #1a1714) 12%, transparent);
    }
    .dot { width: 0.7rem; height: 0.7rem; border-radius: var(--radius-pill, 999px); background: var(--fg); margin-top: 0.35rem; flex: none; }
    .heading { font-weight: 700; margin: 0 0 var(--space-xs, 0.375rem); color: var(--color-ink, #1a1714); }
    .body { color: var(--color-muted, #6f655a); line-height: 1.5; font-size: var(--size-step-0, 1rem); }
    .close { margin-left: auto; border: none; background: none; cursor: pointer; color: var(--color-muted, #6f655a); font-size: 1.1rem; line-height: 1; }
    [hidden] { display: none; }
    :host { --fg: var(--alert-info-fg, #2b6cb0); }
    :host([variant="success"]) { --fg: var(--alert-success-fg, #2f7d4f); }
    :host([variant="warning"]) { --fg: var(--alert-warning-fg, #b8860b); }
    :host([variant="danger"])  { --fg: var(--alert-danger-fg, #c0392b); }
  </style>
  <div class="toast" part="toast" role="status">
    <span class="dot"></span>
    <div>
      <p class="heading" part="heading" hidden></p>
      <div class="body" part="body"><slot></slot></div>
    </div>
    <button class="close" part="close" aria-label="Dismiss">×</button>
  </div>
`;

class DsToast extends HTMLElement {
  static get observedAttributes() { return ["heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this.shadowRoot.querySelector(".close").addEventListener("click", () => this.remove());
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const heading = this.shadowRoot.querySelector(".heading");
    heading.textContent = this.getAttribute("heading") || "";
    heading.hidden = !this.getAttribute("heading");
  }
}
customElements.define("ds-toast", DsToast);
