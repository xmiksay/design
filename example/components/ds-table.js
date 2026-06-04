// ds-table — data table. Data is passed as a JS property (arrays don't fit slots):
//   el.data = { columns: [{ key, label, align }], rows: [{ ...keyed values }] };
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .wrap {
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; font-size: var(--size-step-0, 1rem); }
    caption {
      text-align: left;
      font: 700 0.7rem/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      color: var(--color-accent, #e4572e);
      padding: var(--space-md, 1rem) var(--space-md, 1rem) var(--space-sm, 0.625rem);
      background: var(--color-surface, #fbf8f1);
    }
    th, td {
      text-align: left;
      padding: var(--space-sm, 0.625rem) var(--space-md, 1rem);
      border-top: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
    }
    thead th {
      background: var(--color-surface-2, #f0e9db);
      font: 600 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-muted, #6f655a);
      border-top: none;
    }
    td { color: var(--color-ink, #1a1714); }
    tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--color-surface, #fbf8f1) 60%, transparent); }
    .a-right { text-align: right; }
    .a-center { text-align: center; }
  </style>
  <div class="wrap" part="wrap">
    <table>
      <caption part="caption" hidden></caption>
      <thead><tr></tr></thead>
      <tbody></tbody>
    </table>
  </div>
`;

class DsTable extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._data = { columns: [], rows: [] };
  }
  connectedCallback() {
    if (this.hasAttribute("caption")) {
      const cap = this.shadowRoot.querySelector("caption");
      cap.textContent = this.getAttribute("caption");
      cap.hidden = false;
    }
    this._render();
  }
  set data(value) { this._data = value || { columns: [], rows: [] }; this._render(); }
  get data() { return this._data; }
  _render() {
    if (!this.shadowRoot) return;
    const { columns = [], rows = [] } = this._data;
    const headRow = this.shadowRoot.querySelector("thead tr");
    const body = this.shadowRoot.querySelector("tbody");
    const cls = (a) => (a === "right" ? "a-right" : a === "center" ? "a-center" : "");
    headRow.innerHTML = columns
      .map((c) => `<th class="${cls(c.align)}">${c.label ?? c.key}</th>`)
      .join("");
    body.innerHTML = rows
      .map(
        (r) =>
          `<tr>${columns
            .map((c) => `<td class="${cls(c.align)}">${r[c.key] ?? ""}</td>`)
            .join("")}</tr>`,
      )
      .join("");
  }
}
customElements.define("ds-table", DsTable);
