// ds-specimen — one row of the type scale: a live sample at a step token,
// annotated with the token name and its rendered size, in the mono spec style.
// Attributes: step (size token, e.g. "size-step-3"), label, sample,
//   font ("sans" | "mono"), weight.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .row {
      display: grid;
      grid-template-columns: 9rem 1fr;
      gap: var(--space-lg, 1rem);
      align-items: baseline;
      padding: var(--space-md, 0.7rem) 0;
      border-top: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
    }
    .meta {
      font: 400 var(--size-step--1, 0.66rem)/1.5 var(--font-mono, monospace);
      color: var(--color-muted, #8b93a3);
      text-transform: uppercase;
      letter-spacing: var(--tracking-label, 0.14em);
    }
    .meta b { display: block; color: var(--color-text, #e7e9ee); font-weight: 700; }
    .sample {
      color: var(--color-text, #e7e9ee);
      line-height: var(--leading-snug, 1.3);
      overflow-wrap: anywhere;
    }
  </style>
  <div class="row">
    <div class="meta"><b class="label"></b><span class="px"></span></div>
    <div class="sample"></div>
  </div>
`;

class DsSpecimen extends HTMLElement {
  static get observedAttributes() { return ["step", "label", "sample", "font", "weight"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const step = this.getAttribute("step") || "size-step-1";
    const font = this.getAttribute("font") || "sans";
    const weight = this.getAttribute("weight") || "400";
    const sample = this.shadowRoot.querySelector(".sample");
    sample.style.font = `${weight} var(--${step}) var(--font-${font})`;
    sample.textContent = this.getAttribute("sample") || "The quick brown fox";
    this.shadowRoot.querySelector(".label").textContent = this.getAttribute("label") || `--${step}`;
    this.shadowRoot.querySelector(".px").textContent = getComputedStyle(this).getPropertyValue(`--${step}`).trim();
  }
}
customElements.define("ds-specimen", DsSpecimen);
