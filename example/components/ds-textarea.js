// ds-textarea — labelled multi-line field.
// Attributes: label, name, placeholder, value, rows, hint.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    label {
      display: block;
      font: 600 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-muted, #6f655a);
      margin-bottom: var(--space-xs, 0.375rem);
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
      font: var(--size-step-0, 1rem) var(--font-body, sans-serif);
      color: var(--color-ink, #1a1714);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-sm, 4px);
      padding: var(--space-sm, 0.625rem) var(--space-md, 1rem);
      line-height: 1.5;
    }
    textarea:focus { outline: var(--border-bold, 2px) solid var(--color-accent, #e4572e); outline-offset: 1px; }
    .hint { font-size: var(--size-step--1, 0.82rem); color: var(--color-muted, #6f655a); margin-top: var(--space-xs, 0.375rem); }
    [hidden] { display: none; }
  </style>
  <label part="label" hidden></label>
  <textarea part="field"></textarea>
  <p class="hint" part="hint" hidden></p>
`;

class DsTextarea extends HTMLElement {
  static get observedAttributes() { return ["label", "name", "placeholder", "value", "rows", "hint"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const label = this.shadowRoot.querySelector("label");
    const ta = this.shadowRoot.querySelector("textarea");
    const hint = this.shadowRoot.querySelector(".hint");
    label.textContent = this.getAttribute("label") || "";
    label.hidden = !this.getAttribute("label");
    ta.name = this.getAttribute("name") || "";
    ta.placeholder = this.getAttribute("placeholder") || "";
    ta.rows = Number(this.getAttribute("rows")) || 4;
    ta.value = this.getAttribute("value") || "";
    hint.textContent = this.getAttribute("hint") || "";
    hint.hidden = !this.getAttribute("hint");
  }
}
customElements.define("ds-textarea", DsTextarea);
