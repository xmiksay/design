// ds-testimonial — a pull quote with attribution.
// Attributes: quote, author, role, avatar (image URL, optional).
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; }
    figure {
      margin: 0;
      background: var(--color-surface, #fbf8f1);
      border: var(--border-hairline, 1px) solid var(--color-line, #ddd3c2);
      border-radius: var(--radius-md, 10px);
      padding: var(--space-xl, 3rem) var(--space-lg, 1.75rem) var(--space-lg, 1.75rem);
      position: relative;
    }
    figure::before {
      content: "\\201C";
      position: absolute;
      top: 0.2rem; left: var(--space-lg, 1.75rem);
      font: 600 4rem/1 var(--font-display, serif);
      color: var(--color-accent, #e4572e);
    }
    blockquote {
      margin: 0 0 var(--space-lg, 1.75rem);
      font: var(--size-step-1, 1.33rem)/1.45 var(--font-display, serif);
      color: var(--color-ink, #1a1714);
    }
    figcaption { display: flex; align-items: center; gap: var(--space-md, 1rem); }
    .who { display: flex; flex-direction: column; }
    .author { font-weight: 700; color: var(--color-ink, #1a1714); }
    .role { font-size: var(--size-step--1, 0.82rem); color: var(--color-muted, #6f655a); }
    .av {
      width: 2.75rem; height: 2.75rem;
      border-radius: var(--radius-pill, 999px);
      object-fit: cover;
      background: var(--color-accent, #e4572e);
      display: grid; place-items: center;
      color: var(--color-accent-ink, #fbf8f1);
      font: 600 1rem/1 var(--font-body, sans-serif);
      flex: none;
    }
  </style>
  <figure part="figure">
    <blockquote part="quote"></blockquote>
    <figcaption>
      <span class="av" part="avatar"></span>
      <span class="who">
        <span class="author" part="author"></span>
        <span class="role" part="role"></span>
      </span>
    </figcaption>
  </figure>
`;

class DsTestimonial extends HTMLElement {
  static get observedAttributes() { return ["quote", "author", "role", "avatar"]; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
  connectedCallback() { this._sync(); }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const author = this.getAttribute("author") || "";
    this.shadowRoot.querySelector("blockquote").textContent = this.getAttribute("quote") || "";
    this.shadowRoot.querySelector(".author").textContent = author;
    this.shadowRoot.querySelector(".role").textContent = this.getAttribute("role") || "";
    const av = this.shadowRoot.querySelector(".av");
    const src = this.getAttribute("avatar");
    if (src) {
      av.innerHTML = `<img src="${src}" alt="${author}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" />`;
    } else {
      av.textContent = author ? author.trim()[0].toUpperCase() : "?";
    }
  }
}
customElements.define("ds-testimonial", DsTestimonial);
