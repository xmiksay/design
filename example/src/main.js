// Entry for the landing page (preview/index.html). CSS (tokens + page chrome) is
// loaded via <link> in the HTML; this module only registers components + data.
import "../components/ds-navbar.js";
import "../components/ds-footer.js";
import "../components/ds-hero.js";
import "../components/ds-button.js";
import "../components/ds-card.js";

import { nav, footer } from "./mock.js";

document.getElementById("nav").links = nav.links;

const ftr = document.getElementById("footer");
ftr.setAttribute("brand", footer.brand);
ftr.setAttribute("note", footer.note);
ftr.links = footer.links;
