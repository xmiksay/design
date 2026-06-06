import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

// Apply the saved theme before mount so there's no dark→light flash. The key is
// shared with the previewed substrate (its theme.js listens on "storage"), so
// toggling the tool's theme re-themes a same-origin preview iframe too.
if (localStorage.getItem("design-theme") === "light") {
  document.documentElement.setAttribute("data-theme", "light");
}

createApp(App).mount("#app");
