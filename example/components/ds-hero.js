// ds-hero — page-leading banner.
// Attributes: eyebrow, heading, subhead. Action buttons via the "actions" slot.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    section {
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-lg, 18px);
      padding: var(--space-2xl, 4.5rem) var(--space-xl, 3rem);
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font: 700 0.72rem/1 var(--font-body, sans-serif);
      color: var(--color-accent, #e4572e);
      margin: 0 0 var(--space-sm, 0.625rem);
    }
    .heading {
      font: 600 var(--size-step-4, 3.15rem)/1.03 var(--font-display, serif);
      color: var(--color-ink, #1a1714);
      margin: 0;
      max-width: 22ch;
    }
    .subhead {
      font-size: var(--size-step-1, 1.33rem);
      line-height: 1.5;
      color: var(--color-muted, #6f655a);
      margin: var(--space-md, 1rem) 0 0;
      max-width: 48ch;
    }
    .actions { margin-top: var(--space-lg, 1.75rem); display: flex; flex-wrap: wrap; gap: var(--space-md, 1rem); }
    [hidden] { display: none; }
  </style>
  <section>
    <p class="eyebrow" part="eyebrow" hidden></p>
    <h1 class="heading" part="heading"></h1>
    <p class="subhead" part="subhead" hidden></p>
    <div class="actions"><slot name="actions"></slot></div>
  </section>
`;

class DsHero extends HTMLElement {
  static get observedAttributes() { return ["eyebrow", "heading", "subhead"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const set = (sel, attr) => {
      const el = this.shadowRoot.querySelector(sel);
      const val = this.getAttribute(attr);
      el.textContent = val || "";
      if (el.hasAttribute("hidden") || attr !== "heading") el.hidden = !val;
    };
    set(".eyebrow", "eyebrow");
    set(".heading", "heading");
    set(".subhead", "subhead");
  }
}
customElements.define("ds-hero", DsHero);
