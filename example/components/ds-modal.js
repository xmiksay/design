// ds-modal — dialog overlay. Attributes: heading, open.
// Body via default <slot>; footer actions via the "footer" slot.
// Toggle with the `open` attribute or the open()/close() methods.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: none; }
    :host([open]) { display: block; }
    .backdrop {
      position: fixed;
      inset: 0;
      background: color-mix(in srgb, var(--color-ink, #1a1714) 45%, transparent);
      display: grid;
      place-items: center;
      padding: var(--space-lg, 1.75rem);
      z-index: 50;
    }
    .dialog {
      width: min(34rem, 100%);
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-lg, 18px);
      box-shadow: 8px 8px 0 color-mix(in srgb, var(--color-ink, #1a1714) 18%, transparent);
      overflow: hidden;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md, 1rem);
      padding: var(--space-lg, 1.75rem) var(--space-lg, 1.75rem) var(--space-md, 1rem);
    }
    .heading { font: 600 var(--size-step-2, 1.77rem)/1.1 var(--font-display, serif); margin: 0; color: var(--color-ink, #1a1714); }
    .close { border: none; background: none; cursor: pointer; font-size: 1.5rem; line-height: 1; color: var(--color-muted, #6f655a); }
    .body { padding: 0 var(--space-lg, 1.75rem) var(--space-lg, 1.75rem); color: var(--color-muted, #6f655a); line-height: 1.55; }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm, 0.625rem);
      padding: var(--space-md, 1rem) var(--space-lg, 1.75rem);
      border-top: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      background: var(--color-surface-2, #f0e9db);
    }
  </style>
  <div class="backdrop" part="backdrop">
    <div class="dialog" part="dialog" role="dialog" aria-modal="true">
      <header>
        <h2 class="heading" part="heading"></h2>
        <button class="close" part="close" aria-label="Close">×</button>
      </header>
      <div class="body" part="body"><slot></slot></div>
      <footer part="footer"><slot name="footer"></slot></footer>
    </div>
  </div>
`;

class DsModal extends HTMLElement {
  static get observedAttributes() { return ["heading"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    const dismiss = (e) => { if (e.target === e.currentTarget) this.close(); };
    this.shadowRoot.querySelector(".backdrop").addEventListener("click", dismiss);
    this.shadowRoot.querySelector(".close").addEventListener("click", () => this.close());
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  open() { this.setAttribute("open", ""); }
  close() { this.removeAttribute("open"); }
  _sync() {
    this.shadowRoot.querySelector(".heading").textContent = this.getAttribute("heading") || "";
  }
}
customElements.define("ds-modal", DsModal);
