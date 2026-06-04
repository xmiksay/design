// ds-avatar — user image or initials.
// Attributes: name, src, size ("sm" | "md" | "lg").
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: inline-block; }
    .avatar {
      --dim: 2.75rem;
      width: var(--dim);
      height: var(--dim);
      border-radius: var(--radius-pill, 999px);
      overflow: hidden;
      display: grid;
      place-items: center;
      background: var(--color-accent, #e4572e);
      color: var(--color-accent-ink, #fbf8f1);
      font: 600 calc(var(--dim) * 0.4)/1 var(--font-body, sans-serif);
      border: var(--border-bold, 2px) solid var(--color-surface, #fbf8f1);
      box-shadow: 0 0 0 1px var(--color-line, #ddd3c2);
    }
    :host([size="sm"]) .avatar { --dim: 2rem; }
    :host([size="lg"]) .avatar { --dim: 4rem; }
    img { width: 100%; height: 100%; object-fit: cover; }
  </style>
  <div class="avatar" part="avatar"></div>
`;

class DsAvatar extends HTMLElement {
  static get observedAttributes() { return ["name", "src"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }
  _sync() {
    const box = this.shadowRoot.querySelector(".avatar");
    const src = this.getAttribute("src");
    const name = this.getAttribute("name") || "";
    if (src) {
      box.innerHTML = `<img src="${src}" alt="${name}" />`;
    } else {
      box.textContent = this._initials(name) || "?";
    }
  }
}
customElements.define("ds-avatar", DsAvatar);
