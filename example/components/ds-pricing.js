// ds-pricing — a pricing plan card.
// Attributes: plan, price, period, featured. Features via JS property:
//   el.features = ["...", "..."];  CTA via the "cta" slot.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    .card {
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-lg, 18px);
      padding: var(--space-xl, 3rem) var(--space-lg, 1.75rem);
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 1rem);
    }
    :host([featured]) .card {
      border-color: var(--color-accent, #e4572e);
      border-width: var(--border-bold, 2px);
      box-shadow: 6px 6px 0 color-mix(in srgb, var(--color-accent, #e4572e) 22%, transparent);
    }
    .plan { font: 700 var(--size-step--1, 0.82rem)/1 var(--font-body, sans-serif); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-accent, #e4572e); margin: 0; }
    .price { font: 600 var(--size-step-3, 2.36rem)/1 var(--font-display, serif); color: var(--color-ink, #1a1714); }
    .price .period { font: var(--size-step-0, 1rem) var(--font-body, sans-serif); color: var(--color-muted, #6f655a); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm, 0.625rem); }
    li { display: flex; gap: var(--space-sm, 0.625rem); color: var(--color-muted, #6f655a); line-height: 1.4; }
    li::before { content: "✓"; color: var(--color-success, #2f7d4f); font-weight: 700; }
    .cta { margin-top: auto; }
  </style>
  <div class="card" part="card">
    <p class="plan" part="plan"></p>
    <div class="price" part="price"></div>
    <ul part="features"></ul>
    <div class="cta"><slot name="cta"></slot></div>
  </div>
`;

class DsPricing extends HTMLElement {
  static get observedAttributes() { return ["plan", "price", "period"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._features = [];
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  set features(value) { this._features = value || []; this._sync(); }
  get features() { return this._features; }
  _sync() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelector(".plan").textContent = this.getAttribute("plan") || "";
    const period = this.getAttribute("period");
    this.shadowRoot.querySelector(".price").innerHTML =
      `${this.getAttribute("price") || ""}${period ? `<span class="period"> / ${period}</span>` : ""}`;
    this.shadowRoot.querySelector("ul").innerHTML = this._features.map((f) => `<li>${f}</li>`).join("");
  }
}
customElements.define("ds-pricing", DsPricing);
