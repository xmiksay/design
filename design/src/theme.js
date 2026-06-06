// Theme wiring — applies the dark (default) or light palette and keeps a
// [data-theme-switch] ds-switch in sync. Theme is stored in localStorage so it
// persists and, because localStorage fires a "storage" event in other documents
// of the same origin, the preview iframe re-themes live alongside its parent.
const KEY = "design-theme";

function apply(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

function current() {
  return localStorage.getItem(KEY) || "dark";
}

// Apply as early as the module runs.
apply(current());

function wire() {
  const sw = document.querySelector("[data-theme-switch]");
  if (sw) {
    sw.checked = current() === "light";
    sw.addEventListener("change", (e) => {
      const theme = e.detail.checked ? "light" : "dark";
      localStorage.setItem(KEY, theme);
      apply(theme);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wire);
} else {
  wire();
}

// Cross-document sync (e.g. the device preview iframe).
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  apply(e.newValue || "dark");
  const sw = document.querySelector("[data-theme-switch]");
  if (sw) sw.checked = (e.newValue || "dark") === "light";
});
