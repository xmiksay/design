// ds-swatch — a color token specimen: the color block plus its CSS variable
// name and value, in the tool's mono spec style.
// Attributes: token (CSS var name, e.g. "color-accent"), name (label), value (hex).
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    figure {
      margin: 0;
      border: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
      border-radius: var(--radius-lg, 9px);
      overflow: hidden;
      background: var(--color-panel, #1c1f26);
    }
    .chip {
      height: 64px;
      border-bottom: var(--border-hairline, 1px) solid var(--color-border, #2a2e38);
    }
    figcaption {
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.7rem);
      font: 400 var(--size-step-0, 0.72rem)/1.6 var(--font-mono, monospace);
      color: var(--color-text, #e7e9ee);
    }
    .value {
      display: block;
      text-transform: uppercase;
      color: var(--color-muted, #8b93a3);
    }
  </style>
  <figure>
    <div class="chip" part="chip"></div>
    <figcaption>
      <span class="name" part="name"></span>
      <span class="value" part="value"></span>
    </figcaption>
  </figure>
`;

class DsSwatch extends HTMLElement {
  static get observedAttributes() { return ["token", "name", "value"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const token = this.getAttribute("token");
    this.shadowRoot.querySelector(".chip").style.background = token ? `var(--${token})` : "transparent";
    this.shadowRoot.querySelector(".name").textContent = this.getAttribute("name") || (token ? `--${token}` : "");
    this.shadowRoot.querySelector(".value").textContent = this.getAttribute("value") || "";
  }
}
customElements.define("ds-swatch", DsSwatch);
