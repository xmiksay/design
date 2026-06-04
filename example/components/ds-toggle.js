// ds-toggle — labelled on/off switch.
// Attributes: label, name, checked, disabled.
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
    .track {
      position: relative;
      width: 2.4rem; height: 1.35rem;
      border-radius: var(--radius-pill, 999px);
      background: var(--color-line, #ddd3c2);
      transition: background 150ms ease;
      flex: none;
    }
    .track::after {
      content: "";
      position: absolute;
      top: 0.15rem; left: 0.15rem;
      width: 1.05rem; height: 1.05rem;
      border-radius: var(--radius-pill, 999px);
      background: var(--color-surface, #fbf8f1);
      transition: transform 150ms ease;
    }
    input { position: absolute; opacity: 0; pointer-events: none; }
    :host([checked]) .track { background: var(--color-accent, #e4572e); }
    :host([checked]) .track::after { transform: translateX(1.05rem); }
    :host([disabled]) label { opacity: 0.45; cursor: not-allowed; }
  </style>
  <label>
    <span class="track" part="track"></span>
    <input type="checkbox" />
    <span part="label"></span>
  </label>
`;

class DsToggle extends HTMLElement {
  static get observedAttributes() { return ["label", "name", "checked", "disabled"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this.shadowRoot.querySelector("label").addEventListener("click", () => {
      if (this.hasAttribute("disabled")) return;
      this.toggleAttribute("checked");
    });
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const input = this.shadowRoot.querySelector("input");
    this.shadowRoot.querySelector("span[part=label]").textContent = this.getAttribute("label") || "";
    input.name = this.getAttribute("name") || "";
    input.checked = this.hasAttribute("checked");
    input.disabled = this.hasAttribute("disabled");
  }
}
customElements.define("ds-toggle", DsToggle);
