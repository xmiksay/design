// ds-card — a surface panel with optional eyebrow + heading.
// Attributes: eyebrow, heading. Body content via the default <slot>.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    article {
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      padding: var(--space-lg, 1.75rem);
      height: 100%;
      box-sizing: border-box;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font: 700 0.7rem/1 var(--font-body, sans-serif);
      color: var(--color-accent, #e4572e);
      margin: 0 0 var(--space-sm, 0.625rem);
    }
    .heading {
      font: 600 var(--size-step-2, 1.77rem)/1.1 var(--font-display, serif);
      margin: 0 0 var(--space-sm, 0.625rem);
      color: var(--color-ink, #1a1714);
    }
    .body {
      font-size: var(--size-step-0, 1rem);
      line-height: 1.55;
      color: var(--color-muted, #6f655a);
    }
    [hidden] { display: none; }
  </style>
  <article>
    <p class="eyebrow" part="eyebrow" hidden></p>
    <h3 class="heading" part="heading" hidden></h3>
    <div class="body" part="body"><slot></slot></div>
  </article>
`;

class DsCard extends HTMLElement {
  static get observedAttributes() { return ["eyebrow", "heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._eyebrow = this.shadowRoot.querySelector(".eyebrow");
    this._heading = this.shadowRoot.querySelector(".heading");
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const eyebrow = this.getAttribute("eyebrow");
    const heading = this.getAttribute("heading");
    this._eyebrow.textContent = eyebrow || "";
    this._eyebrow.hidden = !eyebrow;
    this._heading.textContent = heading || "";
    this._heading.hidden = !heading;
  }
}
customElements.define("ds-card", DsCard);
