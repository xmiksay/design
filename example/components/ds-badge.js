// ds-badge — small status pill.
// Attributes: variant ("neutral" | "accent" | "success" | "warning" | "danger" | "info").
// Label via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    .badge {
      display: inline-block;
      font: 700 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif);
      letter-spacing: 0.04em;
      padding: 0.3em 0.7em;
      border-radius: var(--radius-pill, 999px);
      color: var(--fg);
      background: var(--bg);
      border: var(--border-hairline, 1px) solid color-mix(in srgb, var(--fg) 30%, transparent);
    }
    :host { --fg: var(--color-muted, #6f655a); --bg: var(--color-surface-2, #f0e9db); }
    :host([variant="accent"])  { --fg: var(--color-accent-ink, #fbf8f1); --bg: var(--color-accent, #e4572e); }
    :host([variant="success"]) { --fg: var(--alert-success-fg, #2f7d4f); --bg: var(--alert-success-bg, #e3f0e7); }
    :host([variant="warning"]) { --fg: var(--alert-warning-fg, #b8860b); --bg: var(--alert-warning-bg, #f6edd6); }
    :host([variant="danger"])  { --fg: var(--alert-danger-fg, #c0392b);  --bg: var(--alert-danger-bg, #f6e2df); }
    :host([variant="info"])    { --fg: var(--alert-info-fg, #2b6cb0);    --bg: var(--alert-info-bg, #e1ebf5); }
  </style>
  <span class="badge" part="badge"><slot></slot></span>
`;

class DsBadge extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
}
customElements.define("ds-badge", DsBadge);
