// ds-switch — a toggle switch. Mint track when on.
// Attributes: checked, label, disabled.
// Reflects `checked` and emits a "change" event with detail { checked }.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-flex; }
    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-sm, 0.5rem);
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--color-muted, #8b93a3);
      font: 400 var(--size-step-1, 0.82rem)/1 var(--font-mono, monospace);
    }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .track {
      position: relative;
      width: 34px; height: 18px;
      border-radius: var(--radius-pill, 999px);
      background: var(--color-bg, #15171c);
      border: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
      transition: background 130ms ease, border-color 130ms ease;
    }
    .knob {
      position: absolute;
      top: 1px; left: 1px;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: var(--color-muted, #8b93a3);
      transition: transform 130ms ease, background 130ms ease;
    }
    :host([checked]) .track { background: var(--color-accent, #6ee7b7); border-color: var(--color-accent, #6ee7b7); }
    :host([checked]) .knob { transform: translateX(16px); background: var(--color-accent-ink, #08130d); }
    :host([checked]) button { color: var(--color-text, #e7e9ee); }
    button:focus-visible { outline: 2px solid var(--color-accent, #6ee7b7); outline-offset: 3px; border-radius: var(--radius-sm, 4px); }
    .label:empty { display: none; }
  </style>
  <button part="switch" role="switch" aria-checked="false">
    <span class="track"><span class="knob"></span></span>
    <span class="label" part="label"></span>
  </button>
`;

class DsSwitch extends HTMLElement {
  static get observedAttributes() { return ["checked", "label", "disabled"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._btn = this.shadowRoot.querySelector("button");
    this._btn.addEventListener("click", () => {
      if (this.hasAttribute("disabled")) return;
      this.checked = !this.checked;
      this.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { checked: this.checked } }));
    });
  }
  get checked() { return this.hasAttribute("checked"); }
  set checked(v) { this.toggleAttribute("checked", !!v); }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") || "";
    this._btn.disabled = this.hasAttribute("disabled");
    this._btn.setAttribute("aria-checked", String(this.checked));
  }
}
customElements.define("ds-switch", DsSwitch);
