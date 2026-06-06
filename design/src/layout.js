// Page entry for the app-shell view. Registers components and wires the three
// interactions: web/source toggle, file-rail collapse, chat expand.
import "../components/index.js";
import "./theme.js";

const shell = document.getElementById("shell");

// Preview web/source segmented toggle. The device controls only apply to the
// web view, so they hide when source is showing.
const seg = document.getElementById("seg");
const web = document.getElementById("webView");
const src = document.getElementById("srcView");
const devOnly = document.querySelectorAll(".dev-only");
seg.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn) return;
  for (const b of seg.querySelectorAll("button")) b.classList.toggle("on", b === btn);
  const isWeb = btn.dataset.view === "web";
  web.classList.toggle("on", isWeb);
  src.classList.toggle("on", !isWeb);
  for (const el of devOnly) el.classList.toggle("hidden", !isWeb);
});

// Device-size switcher
const device = document.getElementById("device");
const deviceSelect = document.getElementById("deviceSelect");
deviceSelect.addEventListener("change", () => {
  device.setAttribute("device", deviceSelect.value);
});

// Touch-cursor toggle
const touchBtn = document.getElementById("touchBtn");
touchBtn.addEventListener("click", () => {
  const on = device.toggleAttribute("touch");
  touchBtn.classList.toggle("on", on);
});

// File rail collapse
const railToggle = document.getElementById("railToggle");
railToggle.addEventListener("click", () => {
  const collapsed = shell.classList.toggle("rail-collapsed");
  railToggle.textContent = collapsed ? "⟩" : "⟨";
  railToggle.title = collapsed ? "Expand" : "Collapse";
});

// Chat expand
const chatToggle = document.getElementById("chatToggle");
chatToggle.addEventListener("click", () => {
  const wide = shell.classList.toggle("chat-wide");
  chatToggle.textContent = wide ? "⤡" : "⤢";
  chatToggle.title = wide ? "Shrink" : "Expand";
});

// File rows — cosmetic selection
const list = document.querySelector(".filelist");
list.addEventListener("click", (e) => {
  const row = e.target.closest(".file-row");
  if (!row || row.classList.contains("dir")) return;
  for (const r of list.querySelectorAll(".file-row")) r.classList.remove("active");
  row.classList.add("active");
});
