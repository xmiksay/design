<script setup>
// A viewport frame that previews a page at a chosen device size — a native Vue
// port of the design system's ds-device (the tool can't import the substrate's
// own components, since it runs on any folder). Houses the live-preview iframe,
// clamps it to a bezel for the framed presets, and overlays an optional touch
// cursor. Exposes the raw <iframe> so the parent can drive object-inspect.
import { ref, computed } from "vue";

const props = defineProps({
  src: { type: String, default: "" },
  device: { type: String, default: "desktop" },
  touch: { type: Boolean, default: false },
});
const emit = defineEmits(["load"]);

// The single source of device sizes — extend to add more presets.
const PRESETS = {
  desktop: { w: null, h: null, kind: "full" },
  tablet: { w: 820, h: 1180, kind: "tablet" },
  "tablet-sm": { w: 768, h: 1024, kind: "tablet" },
  "mobile-lg": { w: 430, h: 932, kind: "phone" },
  "mobile-sm": { w: 360, h: 740, kind: "phone" },
};

const frame = ref(null);
const ring = ref(null);

const preset = computed(() => PRESETS[props.device] || PRESETS.desktop);
const deviceClass = computed(() =>
  preset.value.kind === "full" ? "full" : `framed ${preset.value.kind}`,
);
const deviceStyle = computed(() => ({
  width: preset.value.w ? preset.value.w + "px" : "",
  height: preset.value.h ? preset.value.h + "px" : "",
}));

// The parent page can't restyle the cursor inside an iframe's own document, so
// the touch overlay draws its own ring above a non-interactive frame.
function onMove(e) {
  const r = ring.value;
  if (!r) return;
  r.style.left = e.offsetX + "px";
  r.style.top = e.offsetY + "px";
  r.style.opacity = "1";
}
function onLeave() {
  if (ring.value) ring.value.style.opacity = "0";
}
function onDown() {
  if (ring.value) {
    ring.value.style.width = "22px";
    ring.value.style.height = "22px";
  }
}
function onUp() {
  if (ring.value) {
    ring.value.style.width = "32px";
    ring.value.style.height = "32px";
  }
}

defineExpose({ getFrame: () => frame.value });
</script>

<template>
  <div class="stage">
    <div class="device" :class="deviceClass" :style="deviceStyle">
      <iframe
        ref="frame"
        :src="src"
        title="Design preview"
        frameborder="0"
        @load="emit('load')"
      />
      <div
        v-show="touch"
        class="touch"
        @mousemove="onMove"
        @mouseleave="onLeave"
        @mousedown="onDown"
        @mouseup="onUp"
      >
        <span ref="ring" class="ring" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage {
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  display: grid;
  place-items: start center;
  padding: 1rem;
}
.device {
  position: relative;
  background: #fff;
}
.device.full {
  width: 100%;
  height: 100%;
}
.device.framed {
  max-height: 100%;
  max-width: 100%;
  border: 9px solid var(--tool-border);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.device.phone {
  border-radius: 38px;
}
.device.tablet {
  border-radius: 24px;
  border-width: 12px;
}
.device.phone::before {
  content: "";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 132px;
  height: 20px;
  z-index: 2;
  background: var(--tool-border);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}
iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: #fff;
}
.device.full iframe {
  border-radius: 10px;
}
.device.phone iframe {
  border-radius: 28px;
}
.device.tablet iframe {
  border-radius: 12px;
}
.touch {
  position: absolute;
  inset: 0;
  z-index: 3;
  cursor: none;
}
.ring {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--tool-accent);
  background: rgba(110, 231, 183, 0.16);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease, width 90ms ease, height 90ms ease;
}
</style>
