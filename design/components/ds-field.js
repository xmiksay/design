// ds-field — labeled text input, matching the tool's address bar / select:
// dark fill, hairline border that turns mint on focus.
// Attributes: label, placeholder, hint, value, type, prefix.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    label {
      display: block;
      font: 400 var(--size-step--1, 0.66rem)/1 var(--font-mono, monospace);
      letter-spacing: var(--tracking-label, 0.14em);
      text-transform: uppercase;
      color: var(--color-muted, #8b93a3);
      margin-bottom: var(--space-xs, 0.4rem);
    }
    label:empty { display: none; }
    .box {
      display: flex;
      align-items: center;
      gap: var(--space-2xs, 0.3rem);
      background: var(--control-bg, #15171c);
      border: var(--border-hairline, 1px) solid var(--control-border, #2a2e38);
      border-radius: var(--radius-md, 7px);
      padding: 0 var(--space-sm, 0.5rem);
      height: 30px;
      transition: border-color 120ms ease;
    }
    .box:focus-within { border-color: var(--control-focus, #6ee7b7); }
    .prefix {
      font: 400 var(--size-step-0, 0.72rem)/1 var(--font-mono, monospace);
      color: var(--color-muted, #8b93a3);
    }
    .prefix:empty { display: none; }
    input {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      font: 400 var(--size-step-1, 0.82rem)/1 var(--font-sans, sans-serif);
      color: var(--color-text, #e7e9ee);
    }
    input::placeholder { color: var(--color-muted, #8b93a3); }
    .hint {
      font: 400 var(--size-step-0, 0.72rem)/1.4 var(--font-sans, sans-serif);
      color: var(--color-muted, #8b93a3);
      margin-top: var(--space-xs, 0.4rem);
    }
    .hint:empty { display: none; }
  </style>
  <label part="label"></label>
  <div class="box">
    <span class="prefix" part="prefix"></span>
    <input part="input" />
  </div>
  <p class="hint" part="hint"></p>
`;

class DsField extends HTMLElement {
  static get observedAttributes() { return ["label", "placeholder", "hint", "value", "type", "prefix"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._input = this.shadowRoot.querySelector("input");
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector("label").textContent = this.getAttribute("label") || "";
    this.shadowRoot.querySelector(".prefix").textContent = this.getAttribute("prefix") || "";
    this.shadowRoot.querySelector(".hint").textContent = this.getAttribute("hint") || "";
    this._input.placeholder = this.getAttribute("placeholder") || "";
    this._input.type = this.getAttribute("type") || "text";
    if (this.hasAttribute("value")) this._input.value = this.getAttribute("value");
  }
}
customElements.define("ds-field", DsField);
