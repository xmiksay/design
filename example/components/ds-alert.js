// ds-alert — inline status message.
// Attributes: variant ("info" | "success" | "warning" | "danger"), heading.
// Body via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .alert {
      display: flex;
      gap: var(--space-md, 1rem);
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      border-radius: var(--radius-md, 10px);
      border-left: var(--border-bold, 2px) solid var(--fg);
      background: var(--bg);
    }
    .icon { color: var(--fg); font-weight: 700; line-height: 1.4; }
    .content { color: var(--color-ink, #1a1714); }
    .heading { font-weight: 700; margin: 0 0 var(--space-xs, 0.375rem); color: var(--fg); }
    .body { color: var(--color-muted, #6f655a); line-height: 1.5; }
    [hidden] { display: none; }
    :host([variant="info"])    { --fg: var(--alert-info-fg, #2b6cb0);    --bg: var(--alert-info-bg, #e1ebf5); }
    :host([variant="success"]) { --fg: var(--alert-success-fg, #2f7d4f); --bg: var(--alert-success-bg, #e3f0e7); }
    :host([variant="warning"]) { --fg: var(--alert-warning-fg, #b8860b); --bg: var(--alert-warning-bg, #f6edd6); }
    :host([variant="danger"])  { --fg: var(--alert-danger-fg, #c0392b);  --bg: var(--alert-danger-bg, #f6e2df); }
    :host { --fg: var(--alert-info-fg, #2b6cb0); --bg: var(--alert-info-bg, #e1ebf5); }
  </style>
  <div class="alert" part="alert" role="status">
    <span class="icon" part="icon"></span>
    <div class="content">
      <p class="heading" part="heading" hidden></p>
      <div class="body" part="body"><slot></slot></div>
    </div>
  </div>
`;

const ICONS = { info: "i", success: "✓", warning: "!", danger: "✕" };

class DsAlert extends HTMLElement {
  static get observedAttributes() { return ["variant", "heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const variant = this.getAttribute("variant") || "info";
    this.shadowRoot.querySelector(".icon").textContent = ICONS[variant] || ICONS.info;
    const heading = this.shadowRoot.querySelector(".heading");
    heading.textContent = this.getAttribute("heading") || "";
    heading.hidden = !this.getAttribute("heading");
  }
}
customElements.define("ds-alert", DsAlert);
