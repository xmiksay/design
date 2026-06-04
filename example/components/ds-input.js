// ds-input — labelled text field.
// Attributes: label, type, name, placeholder, value, hint, invalid.
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
    input {
      width: 100%;
      box-sizing: border-box;
      font: var(--size-step-0, 1rem) var(--font-body, sans-serif);
      color: var(--color-ink, #1a1714);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-sm, 4px);
      padding: var(--space-sm, 0.625rem) var(--space-md, 1rem);
    }
    input:focus { outline: var(--border-bold, 2px) solid var(--color-accent, #e4572e); outline-offset: 1px; }
    :host([invalid]) input { border-color: var(--color-danger, #c0392b); }
    .hint { font-size: var(--size-step--1, 0.82rem); color: var(--color-muted, #6f655a); margin-top: var(--space-xs, 0.375rem); }
    :host([invalid]) .hint { color: var(--color-danger, #c0392b); }
    [hidden] { display: none; }
  </style>
  <label part="label" hidden></label>
  <input part="field" />
  <p class="hint" part="hint" hidden></p>
`;

class DsInput extends HTMLElement {
  static get observedAttributes() { return ["label", "type", "name", "placeholder", "value", "hint"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const label = this.shadowRoot.querySelector("label");
    const input = this.shadowRoot.querySelector("input");
    const hint = this.shadowRoot.querySelector(".hint");
    label.textContent = this.getAttribute("label") || "";
    label.hidden = !this.getAttribute("label");
    input.type = this.getAttribute("type") || "text";
    input.name = this.getAttribute("name") || "";
    input.placeholder = this.getAttribute("placeholder") || "";
    input.value = this.getAttribute("value") || "";
    hint.textContent = this.getAttribute("hint") || "";
    hint.hidden = !this.getAttribute("hint");
  }
}
customElements.define("ds-input", DsInput);
