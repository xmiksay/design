// ds-radio — labelled radio button (group with a shared `name`).
// Attributes: label, name, value, checked, disabled.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 0.625rem);
      cursor: pointer;
      font: var(--size-step-0, 1rem) var(--font-body, sans-serif);
      color: var(--color-ink, #1a1714);
    }
    input {
      appearance: none;
      width: 1.15rem; height: 1.15rem;
      margin: 0;
      border: var(--border-bold, 2px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-pill, 999px);
      background: var(--color-surface, #fbf8f1);
      display: grid; place-content: center;
      cursor: pointer;
    }
    input::before {
      content: "";
      width: 0.55rem; height: 0.55rem;
      border-radius: var(--radius-pill, 999px);
      background: var(--color-accent, #e4572e);
      transform: scale(0);
      transition: transform 100ms ease;
    }
    input:checked { border-color: var(--color-accent, #e4572e); }
    input:checked::before { transform: scale(1); }
    input:focus-visible { outline: var(--border-bold, 2px) solid var(--color-accent, #e4572e); outline-offset: 2px; }
    :host([disabled]) label { opacity: 0.45; cursor: not-allowed; }
  </style>
  <label><input type="radio" part="control" /><span part="label"></span></label>
`;

class DsRadio extends HTMLElement {
  static get observedAttributes() { return ["label", "name", "value", "checked", "disabled"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const input = this.shadowRoot.querySelector("input");
    this.shadowRoot.querySelector("span").textContent = this.getAttribute("label") || "";
    input.name = this.getAttribute("name") || "";
    input.value = this.getAttribute("value") || "";
    input.checked = this.hasAttribute("checked");
    input.disabled = this.hasAttribute("disabled");
  }
}
customElements.define("ds-radio", DsRadio);
