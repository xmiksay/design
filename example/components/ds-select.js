// ds-select — labelled dropdown. Options via attribute or JS property:
//   el.options = [{ value, label }];  (or just an array of strings)
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
    .field {
      position: relative;
    }
    select {
      width: 100%;
      box-sizing: border-box;
      appearance: none;
      font: var(--size-step-0, 1rem) var(--font-body, sans-serif);
      color: var(--color-ink, #1a1714);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-sm, 4px);
      padding: var(--space-sm, 0.625rem) var(--space-xl, 3rem) var(--space-sm, 0.625rem) var(--space-md, 1rem);
      cursor: pointer;
    }
    select:focus { outline: var(--border-bold, 2px) solid var(--color-accent, #e4572e); outline-offset: 1px; }
    .field::after {
      content: "";
      position: absolute;
      right: var(--space-md, 1rem);
      top: 50%;
      width: 0.5rem; height: 0.5rem;
      border-right: 2px solid var(--color-muted, #6f655a);
      border-bottom: 2px solid var(--color-muted, #6f655a);
      transform: translateY(-65%) rotate(45deg);
      pointer-events: none;
    }
  </style>
  <label part="label" hidden></label>
  <div class="field"><select part="field"></select></div>
`;

class DsSelect extends HTMLElement {
  static get observedAttributes() { return ["label", "name"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._options = [];
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  set options(value) { this._options = value || []; this._sync(); }
  get options() { return this._options; }
  _sync() {
    const label = this.shadowRoot.querySelector("label");
    const select = this.shadowRoot.querySelector("select");
    label.textContent = this.getAttribute("label") || "";
    label.hidden = !this.getAttribute("label");
    select.name = this.getAttribute("name") || "";
    select.innerHTML = this._options
      .map((o) => {
        const value = typeof o === "string" ? o : o.value;
        const text = typeof o === "string" ? o : o.label ?? o.value;
        return `<option value="${value}">${text}</option>`;
      })
      .join("");
  }
}
customElements.define("ds-select", DsSelect);
