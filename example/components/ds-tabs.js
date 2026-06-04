// ds-tabs — tabbed panels. Data via JS property:
//   el.tabs = [{ label, content }];   (content is an HTML string)
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .tablist {
      display: flex;
      gap: var(--space-md, 1rem);
      border-bottom: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
    }
    button {
      appearance: none;
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-sm, 0.625rem) var(--space-xs, 0.375rem);
      font: 600 var(--size-step-0, 1rem)/1 var(--font-body, sans-serif);
      color: var(--color-muted, #6f655a);
      border-bottom: var(--border-bold, 2px) solid transparent;
      margin-bottom: -1px;
    }
    button:hover { color: var(--color-ink, #1a1714); }
    button[aria-selected="true"] { color: var(--color-accent, #e4572e); border-bottom-color: var(--color-accent, #e4572e); }
    .panel {
      padding: var(--space-md, 1rem) 0;
      color: var(--color-muted, #6f655a);
      line-height: 1.55;
    }
  </style>
  <div class="tablist" role="tablist" part="tablist"></div>
  <div class="panel" role="tabpanel" part="panel"></div>
`;

class DsTabs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._tabs = [];
    this._active = 0;
    this.shadowRoot.querySelector(".tablist").addEventListener("click", (e) => {
      const i = e.target.dataset?.index;
      if (i != null) { this._active = Number(i); this._render(); }
    });
  }
  connectedCallback() { this._render(); }
  set tabs(value) { this._tabs = value || []; this._active = 0; this._render(); }
  get tabs() { return this._tabs; }
  _render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelector(".tablist").innerHTML = this._tabs
      .map((t, i) => `<button role="tab" data-index="${i}" aria-selected="${i === this._active}">${t.label}</button>`)
      .join("");
    this.shadowRoot.querySelector(".panel").innerHTML = this._tabs[this._active]?.content || "";
  }
}
customElements.define("ds-tabs", DsTabs);
