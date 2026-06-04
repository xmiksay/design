// ds-list — a vertical list of items with title/meta/body. Data via JS property:
//   el.items = [{ title, meta, body }];
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      overflow: hidden;
      background: var(--color-surface, #fbf8f1);
    }
    li {
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      border-top: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
    }
    li:first-child { border-top: none; }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-md, 1rem); }
    .title { font: 600 var(--size-step-0, 1rem)/1.2 var(--font-body, sans-serif); color: var(--color-ink, #1a1714); }
    .meta { font: var(--size-step--1, 0.82rem) var(--font-body, sans-serif); color: var(--color-muted, #6f655a); white-space: nowrap; }
    .body { margin-top: var(--space-xs, 0.375rem); color: var(--color-muted, #6f655a); line-height: 1.5; }
    [hidden] { display: none; }
  </style>
  <ul part="list"></ul>
`;

class DsList extends HTMLElement {
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
    this.shadowRoot.querySelector("ul").innerHTML = this._items
      .map(
        (it) => `
        <li>
          <div class="row">
            <span class="title">${it.title}</span>
            ${it.meta ? `<span class="meta">${it.meta}</span>` : ""}
          </div>
          ${it.body ? `<div class="body">${it.body}</div>` : ""}
        </li>`,
      )
      .join("");
  }
}
customElements.define("ds-list", DsList);
