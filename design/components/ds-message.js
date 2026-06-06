// ds-message — a chat bubble, mirroring the tool's conversation view.
// Attributes: role ("user" | "assistant" | "queued"). Content via <slot>.
// user = mint fill aligned right; assistant = panel + border aligned left;
// queued = dashed, provisional.
const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: flex; flex-direction: column; }
    :host([role="user"]), :host([role="queued"]) { align-items: flex-end; }
    .bubble {
      max-width: 95%;
      padding: var(--space-sm, 0.5rem) var(--space-md, 0.7rem);
      border-radius: var(--radius-xl, 10px);
      font: 400 var(--size-step-2, 0.86rem)/1.45 var(--font-sans, sans-serif);
      border: var(--border-hairline, 1px) solid transparent;
    }
    :host([role="user"]) .bubble {
      background: var(--bubble-user-bg, #6ee7b7);
      color: var(--bubble-user-fg, #08130d);
      border-bottom-right-radius: var(--radius-tail, 3px);
    }
    :host([role="assistant"]) .bubble {
      background: var(--bubble-bot-bg, #1c1f26);
      color: var(--color-text, #e7e9ee);
      border-color: var(--color-border, #2a2e38);
      border-bottom-left-radius: var(--radius-tail, 3px);
    }
    :host([role="queued"]) .bubble {
      background: var(--color-accent-soft, #2e4b46);
      color: var(--color-text, #e7e9ee);
      border: var(--border-hairline, 1px) dashed var(--color-accent, #6ee7b7);
      opacity: 0.85;
    }
  </style>
  <div class="bubble" part="bubble"><slot></slot></div>
`;

class DsMessage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
  }
}
customElements.define("ds-message", DsMessage);
