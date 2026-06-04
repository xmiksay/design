// Entry for the component gallery (preview/components.html). Registers every
// component and renders one labelled specimen per component, fed with mock data.
// CSS is loaded via <link> in the HTML.
import "../components/index.js";
import * as mock from "./mock.js";

const root = document.getElementById("specimens");

// Build one labelled specimen frame. `build` receives the stage element and
// fills it with live, mock-fed component instances. `block` switches the stage
// from an inline flex row to stacked block layout (for wide components).
function specimen(name, desc, build, { block = false } = {}) {
  const frame = document.createElement("section");
  frame.className = "specimen";
  frame.innerHTML = `
    <div class="specimen__head">
      <span class="specimen__name">&lt;${name}&gt;</span>
      <span class="specimen__desc">${desc}</span>
    </div>
    <div class="specimen__stage${block ? " specimen__stage--block" : ""}"></div>`;
  build(frame.querySelector(".specimen__stage"));
  root.append(frame);
}

// Small helpers ------------------------------------------------------------
const el = (tag, attrs = {}, html) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  if (html != null) node.innerHTML = html;
  return node;
};
const prop = (tag, key, value, attrs = {}) => {
  const node = el(tag, attrs);
  node[key] = value;
  return node;
};

// Specimens ----------------------------------------------------------------
specimen("ds-button", "variant: solid · ghost · danger, plus disabled", (s) => {
  s.append(
    el("ds-button", {}, "Primary action"),
    el("ds-button", { variant: "ghost" }, "Secondary"),
    el("ds-button", { variant: "danger" }, "Delete"),
    el("ds-button", { disabled: true }, "Disabled"),
  );
});

specimen("ds-badge", "status pills across the state palette", (s) => {
  s.append(
    el("ds-badge", {}, "Neutral"),
    el("ds-badge", { variant: "accent" }, "Accent"),
    el("ds-badge", { variant: "success" }, "Shipped"),
    el("ds-badge", { variant: "warning" }, "Pending"),
    el("ds-badge", { variant: "danger" }, "Failed"),
    el("ds-badge", { variant: "info" }, "Info"),
  );
});

specimen("ds-card", "eyebrow + heading + slotted body", (s) => {
  s.append(
    el("ds-card", { eyebrow: "Token-driven", heading: "Styled from variables" },
      "Every value comes from <code>tokens.css</code>, compiled from DTCG JSON."),
  );
}, { block: true });

specimen("ds-hero", "page-leading banner with slotted actions", (s) => {
  const hero = el("ds-hero", {
    eyebrow: "New",
    heading: "A hero that reads its theme from tokens.",
    subhead: "Headline, subhead and call-to-action buttons in one banner.",
  });
  hero.append(el("ds-button", { slot: "actions" }, "Get started"));
  hero.append(el("ds-button", { slot: "actions", variant: "ghost" }, "Learn more"));
  s.append(hero);
}, { block: true });

specimen("ds-table", "data-driven rows + columns", (s) => {
  s.append(prop("ds-table", "data", mock.table, { caption: mock.table.caption }));
}, { block: true });

specimen("ds-accordion", "stacked disclosure panels", (s) => {
  s.append(prop("ds-accordion", "items", mock.accordion));
}, { block: true });

specimen("ds-tabs", "tabbed panels", (s) => {
  s.append(prop("ds-tabs", "tabs", mock.tabs));
}, { block: true });

specimen("ds-input / ds-textarea / ds-select", "form fields with labels + hints", (s) => {
  s.style.alignItems = "flex-start";
  s.append(
    el("ds-input", { label: "Email", type: "email", placeholder: "you@example.com", hint: "We never share it." }),
    el("ds-input", { label: "Quantity", value: "12", invalid: true, hint: "Out of stock above 10." }),
    prop("ds-select", "options", mock.selectOptions, { label: "Format" }),
  );
});

specimen("ds-textarea", "multi-line field", (s) => {
  s.append(el("ds-textarea", { label: "Notes", rows: "3", placeholder: "Anything we should know?" }));
}, { block: true });

specimen("ds-checkbox / ds-radio / ds-toggle", "selection controls", (s) => {
  s.append(
    el("ds-checkbox", { label: "Subscribe", checked: true }),
    el("ds-checkbox", { label: "Gift wrap" }),
    el("ds-radio", { name: "ship", label: "Standard", checked: true }),
    el("ds-radio", { name: "ship", label: "Express" }),
    el("ds-toggle", { label: "Dark mode", checked: true }),
  );
});

specimen("ds-navbar", "brand + links + slotted actions", (s) => {
  const bar = prop("ds-navbar", "links", mock.nav.links, { brand: mock.nav.brand });
  bar.append(el("ds-button", { slot: "actions", variant: "ghost" }, "Sign in"));
  s.append(bar);
}, { block: true });

specimen("ds-breadcrumb", "hierarchical trail", (s) => {
  s.append(prop("ds-breadcrumb", "items", mock.breadcrumb));
}, { block: true });

specimen("ds-sidebar", "vertical nav with sections", (s) => {
  s.append(prop("ds-sidebar", "items", mock.sidebar, { heading: "Atelier" }));
}, { block: true });

specimen("ds-alert", "inline status across variants", (s) => {
  s.append(
    el("ds-alert", { variant: "info", heading: "Heads up" }, "A new theme is available."),
    el("ds-alert", { variant: "success", heading: "Saved" }, "Your tokens compiled cleanly."),
    el("ds-alert", { variant: "warning", heading: "Low stock" }, "Only 3 notebooks left."),
    el("ds-alert", { variant: "danger", heading: "Build failed" }, "Token alias could not resolve."),
  );
  s.classList.remove("specimen__stage");
  s.classList.add("specimen__stage", "specimen__stage--block");
  s.style.display = "grid";
  s.style.gap = "var(--space-md)";
}, { block: true });

specimen("ds-toast", "transient notification card", (s) => {
  s.append(
    el("ds-toast", { variant: "success", heading: "Order shipped" }, "Tracking #1042 is on its way."),
    el("ds-toast", { variant: "danger", heading: "Payment declined" }, "Please update your card."),
  );
});

specimen("ds-modal", "dialog overlay (click to open)", (s) => {
  const open = el("ds-button", {}, "Open dialog");
  const modal = el("ds-modal", { heading: "Delete notebook?" },
    "This permanently removes the item and its order history.");
  const cancel = el("ds-button", { slot: "footer", variant: "ghost" }, "Cancel");
  const confirm = el("ds-button", { slot: "footer", variant: "danger" }, "Delete");
  cancel.addEventListener("click", () => modal.close());
  confirm.addEventListener("click", () => modal.close());
  modal.append(cancel, confirm);
  open.addEventListener("click", () => modal.open());
  s.append(open, modal);
});

specimen("ds-tooltip", "hover/focus hint", (s) => {
  const t = el("ds-tooltip", { text: "Tokens compile to CSS custom properties" });
  t.append(el("ds-button", { variant: "ghost" }, "Hover me"));
  s.append(t);
});

specimen("ds-stat", "metric with trend delta", (s) => {
  for (const st of mock.stats) {
    s.append(el("ds-stat", { label: st.label, value: st.value, delta: st.delta, trend: st.trend }));
  }
});

specimen("ds-avatar", "image or initials, three sizes", (s) => {
  s.append(
    el("ds-avatar", { name: "Mara Ellison", size: "sm" }),
    el("ds-avatar", { name: "Tomás Vega" }),
    el("ds-avatar", { name: "Aiko Tanaka", size: "lg" }),
  );
});

specimen("ds-list", "title / meta / body rows", (s) => {
  s.append(prop("ds-list", "items", mock.list));
}, { block: true });

specimen("ds-pricing", "plan cards, one featured", (s) => {
  s.style.alignItems = "stretch";
  for (const tier of mock.pricing) {
    const card = prop("ds-pricing", "features", tier.features, {
      plan: tier.plan, price: tier.price, period: tier.period, featured: tier.featured,
    });
    card.append(el("ds-button", { slot: "cta", variant: tier.featured ? "solid" : "ghost" }, "Choose"));
    card.style.flex = "1 1 14rem";
    s.append(card);
  }
});

specimen("ds-testimonial", "pull quote with attribution", (s) => {
  s.append(el("ds-testimonial", {
    quote: mock.testimonial.quote,
    author: mock.testimonial.author,
    role: mock.testimonial.role,
  }));
}, { block: true });

specimen("ds-footer", "brand + note + links", (s) => {
  s.append(prop("ds-footer", "links", mock.footer.links, {
    brand: mock.footer.brand, note: mock.footer.note,
  }));
}, { block: true });
