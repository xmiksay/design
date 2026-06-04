// Entry for the composed layout page (preview/layout.html) — the components
// working together as one realistic dashboard, all fed from src/mock.js.
// CSS is loaded via <link> in the HTML.
import "../components/index.js";
import * as mock from "./mock.js";

const $ = (id) => document.getElementById(id);

// Top navigation + breadcrumb
$("nav").links = mock.nav.links;
$("crumbs").items = mock.breadcrumb;

// Stat row
const stats = $("stats");
for (const st of mock.stats) {
  const node = document.createElement("ds-stat");
  node.setAttribute("label", st.label);
  node.setAttribute("value", st.value);
  node.setAttribute("delta", st.delta);
  node.setAttribute("trend", st.trend);
  stats.append(node);
}

// Sidebar + main content
$("sidebar").items = mock.sidebar;
$("orders").data = mock.table;
$("tabs").tabs = mock.tabs;
$("faq").items = mock.accordion;

// Pricing
const pricing = $("pricing");
for (const tier of mock.pricing) {
  const card = document.createElement("ds-pricing");
  card.setAttribute("plan", tier.plan);
  card.setAttribute("price", tier.price);
  card.setAttribute("period", tier.period);
  if (tier.featured) card.setAttribute("featured", "");
  card.features = tier.features;
  const cta = document.createElement("ds-button");
  cta.setAttribute("slot", "cta");
  if (!tier.featured) cta.setAttribute("variant", "ghost");
  cta.textContent = "Choose plan";
  card.append(cta);
  pricing.append(card);
}

// Testimonial
const q = $("quote");
q.setAttribute("quote", mock.testimonial.quote);
q.setAttribute("author", mock.testimonial.author);
q.setAttribute("role", mock.testimonial.role);

// Footer
const ftr = $("footer");
ftr.setAttribute("brand", mock.footer.brand);
ftr.setAttribute("note", mock.footer.note);
ftr.links = mock.footer.links;
