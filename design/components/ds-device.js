// ds-device — a viewport frame for previewing a page at a chosen device size.
// Houses an <iframe> and clamps it to a bezel for the framed presets.
//
// Attributes:
//   device  preset key (see PRESETS) — desktop | tablet | tablet-sm |
//           mobile-lg | mobile-sm
//   src     URL — the page to load in the iframe
//   touch   boolean — overlay a touch cursor (a tap ring that follows the
//           pointer). A parent page can't restyle the cursor inside an iframe's
//           own document, so this overlay draws its own pointer above the frame;
//           the iframe is non-interactive while it's on. Real touch emulation
//           needs DevTools/CDP, not page JS.
//
// PRESETS is the single source of device sizes — extend it to add more.
const PRESETS = {
  "desktop":   { label: "Desktop",      w: null, h: null,  kind: "full"   },
  "tablet":    { label: "Tablet",       w: 820,  h: 1180,  kind: "tablet" },
  "tablet-sm": { label: "Small tablet", w: 768,  h: 1024,  kind: "tablet" },
  "mobile-lg": { label: "Large phone",  w: 430,  h: 932,   kind: "phone"  },
  "mobile-sm": { label: "Small phone",  w: 360,  h: 740,   kind: "phone"  },
};

const tpl = document.createElement("template");
tpl.innerHTML = `
  <style>
    :host { display: block; height: 100%; }
    .stage {
      height: 100%;
      box-sizing: border-box;
      overflow: auto;
      display: grid;
      place-items: start center;
      padding: var(--space-lg, 1rem);
      scrollbar-width: thin;
      scrollbar-color: var(--color-border, #2a2e38) transparent;
    }
    .stage::-webkit-scrollbar { width: 11px; height: 11px; }
    .stage::-webkit-scrollbar-track { background: transparent; }
    .stage::-webkit-scrollbar-thumb {
      background: var(--color-border, #2a2e38);
      border-radius: var(--radius-pill, 999px);
      border: 3px solid var(--color-bg, #15171c);
    }
    .stage::-webkit-scrollbar-thumb:hover { background: var(--color-muted, #8b93a3); }
    .device { position: relative; background: var(--color-bg, #15171c); }
    .device.full { width: 100%; height: 100%; }
    .device.framed {
      max-height: 100%;
      max-width: 100%;
      border: 9px solid var(--color-border, #2a2e38);
      box-shadow: var(--shadow-pop, 0 12px 36px rgba(0,0,0,0.4));
      overflow: hidden;
    }
    .device.phone  { border-radius: 38px; }
    .device.tablet { border-radius: 24px; border-width: 12px; }
    .device.phone::before {
      content: "";
      position: absolute;
      top: 0; left: 50%; transform: translateX(-50%);
      width: 132px; height: 20px; z-index: 2;
      background: var(--color-border, #2a2e38);
      border-bottom-left-radius: 12px;
      border-bottom-right-radius: 12px;
    }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--color-bg, #15171c); }
    .device.phone iframe  { border-radius: 28px; }
    .device.tablet iframe { border-radius: 12px; }

    /* Touch overlay — only shown when [touch] is set. */
    .touch { position: absolute; inset: 0; z-index: 3; cursor: none; display: none; }
    .device.is-touch .touch { display: block; }
    .ring {
      position: absolute; width: 32px; height: 32px;
      border-radius: 50%;
      border: 2px solid var(--color-accent, #6ee7b7);
      background: rgba(110, 231, 183, 0.16);
      transform: translate(-50%, -50%);
      pointer-events: none; opacity: 0;
      transition: opacity 120ms ease, width 90ms ease, height 90ms ease;
    }
  </style>
  <div class="stage">
    <div class="device" part="device">
      <iframe part="frame" title="preview"></iframe>
      <div class="touch" part="touch"><span class="ring"></span></div>
    </div>
  </div>
`;

class DsDevice extends HTMLElement {
  static get observedAttributes() { return ["device", "src", "touch"]; }
  static get presets() { return PRESETS; }
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(tpl.content.cloneNode(true));
    this._device = this.shadowRoot.querySelector(".device");
    this._frame = this.shadowRoot.querySelector("iframe");
    this._touch = this.shadowRoot.querySelector(".touch");
    this._ring = this.shadowRoot.querySelector(".ring");
    this._onMove = (e) => {
      this._ring.style.left = e.offsetX + "px";
      this._ring.style.top = e.offsetY + "px";
      this._ring.style.opacity = "1";
    };
    this._onLeave = () => { this._ring.style.opacity = "0"; };
    this._onDown = () => { this._ring.style.width = "22px"; this._ring.style.height = "22px"; };
    this._onUp = () => { this._ring.style.width = "32px"; this._ring.style.height = "32px"; };
  }
  connectedCallback() {
    this._touch.addEventListener("mousemove", this._onMove);
    this._touch.addEventListener("mouseleave", this._onLeave);
    this._touch.addEventListener("mousedown", this._onDown);
    this._touch.addEventListener("mouseup", this._onUp);
    this._sync();
  }
  disconnectedCallback() {
    this._touch.removeEventListener("mousemove", this._onMove);
    this._touch.removeEventListener("mouseleave", this._onLeave);
    this._touch.removeEventListener("mousedown", this._onDown);
    this._touch.removeEventListener("mouseup", this._onUp);
  }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    const preset = PRESETS[this.getAttribute("device")] || PRESETS.desktop;
    const d = this._device;
    d.className = "device " + (preset.kind === "full" ? "full" : `framed ${preset.kind}`);
    d.classList.toggle("is-touch", this.hasAttribute("touch"));
    d.style.width = preset.w ? preset.w + "px" : "";
    d.style.height = preset.h ? preset.h + "px" : "";
    const src = this.getAttribute("src") || "";
    if (this._frame.getAttribute("src") !== src) this._frame.setAttribute("src", src);
  }
}
customElements.define("ds-device", DsDevice);
