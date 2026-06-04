// ds-accordion — stacked disclosure panels. Data via JS property:
//   el.items = [{ title, body }];
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .wrap {
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      overflow: hidden;
      background: var(--color-surface, #fbf8f1);
    }
    details { border-top: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2); }
    details:first-child { border-top: none; }
    summary {
      list-style: none;
      cursor: pointer;
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      font: 600 var(--size-step-0, 1rem)/1.2 var(--font-body, sans-serif);
      color: var(--color-ink, #1a1714);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-md, 1rem);
    }
    summary::-webkit-details-marker { display: none; }
    summary::after {
      content: "+";
      color: var(--color-accent, #e4572e);
      font-size: 1.2em;
      transition: transform 150ms ease;
    }
    details[open] summary::after { transform: rotate(45deg); }
    .body {
      padding: 0 var(--space-lg, 1.75rem) var(--space-md, 1rem);
      color: var(--color-muted, #6f655a);
      line-height: 1.55;
    }
  </style>
  <div class="wrap" part="wrap"></div>
`;

class DsAccordion extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._items = [];
  }
  connectedCallback() { this._render(); }
  set items(value) { this._items = value || []; this._render(); }
  get items() { return this._items; }
  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelector(".wrap").innerHTML = this._items
      .map(
        (it, i) => `
        <details${i === 0 ? " open" : ""}>
          <summary>${it.title}</summary>
          <div class="body">${it.body}</div>
        </details>`,
      )
      .join("");
  }
}
customElements.define("ds-accordion", DsAccordion);
