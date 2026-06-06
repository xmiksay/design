<script setup>
// Dark/light theme toggle — a mint switch reproducing the design system's
// ds-switch. Persists to localStorage ("design-theme") and applies
// [data-theme="light"] on <html>. The key is shared with the previewed
// substrate, which listens for "storage" and re-themes its iframe in step.
import { ref, onMounted, onBeforeUnmount } from "vue";

const KEY = "design-theme";
const light = ref(false);

function apply(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
}

function toggle() {
  light.value = !light.value;
  const theme = light.value ? "light" : "dark";
  localStorage.setItem(KEY, theme);
  apply(theme);
}

// Re-sync if the theme is changed in another document of the same origin.
function onStorage(e) {
  if (e.key !== KEY) return;
  light.value = (e.newValue || "dark") === "light";
  apply(e.newValue || "dark");
}

onMounted(() => {
  light.value = (localStorage.getItem(KEY) || "dark") === "light";
  window.addEventListener("storage", onStorage);
});
onBeforeUnmount(() => window.removeEventListener("storage", onStorage));
</script>

<template>
  <button
    class="switch"
    role="switch"
    :aria-checked="light"
    title="Toggle light / dark theme"
    @click="toggle"
  >
    <span class="track" :class="{ on: light }"><span class="knob" /></span>
    <span class="label" :class="{ on: light }">Light</span>
  </button>
</template>

<style scoped>
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--tool-mono);
  font-size: 0.82rem;
  color: var(--tool-muted);
}
.track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: var(--tool-bg);
  border: 1px solid var(--tool-border);
  transition: background 130ms ease, border-color 130ms ease;
}
.knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--tool-muted);
  transition: transform 130ms ease, background 130ms ease;
}
.track.on {
  background: var(--tool-accent);
  border-color: var(--tool-accent);
}
.track.on .knob {
  transform: translateX(16px);
  background: var(--tool-accent-ink);
}
.label.on {
  color: var(--tool-text);
}
.switch:focus-visible {
  outline: 2px solid var(--tool-accent);
  outline-offset: 3px;
  border-radius: 4px;
}
</style>
