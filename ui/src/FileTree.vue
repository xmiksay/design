<script setup>
// Recursive file-tree node. Directories are collapsible; files emit `open`.
import { ref } from "vue";

const props = defineProps({
  nodes: { type: Array, required: true },
  selected: { type: String, default: null },
  depth: { type: Number, default: 0 },
});
const emit = defineEmits(["open"]);

// Track collapsed dirs by path; top two levels start expanded.
const collapsed = ref({});
function toggle(path) {
  collapsed.value[path] = !collapsed.value[path];
}
function isCollapsed(node) {
  return collapsed.value[node.path] ?? props.depth >= 1;
}
</script>

<template>
  <ul class="tree" :class="{ 'tree--root': depth === 0 }">
    <li v-for="node in nodes" :key="node.path || node.name">
      <template v-if="node.kind === 'dir'">
        <button
          class="row dir"
          :style="{ paddingLeft: depth * 12 + 8 + 'px' }"
          @click="toggle(node.path)"
        >
          <span class="twisty">{{ isCollapsed(node) ? "▸" : "▾" }}</span>
          <span class="icon">▢</span>
          <span class="name">{{ node.name }}</span>
        </button>
        <FileTree
          v-if="!isCollapsed(node) && node.children"
          :nodes="node.children"
          :selected="selected"
          :depth="depth + 1"
          @open="(p) => emit('open', p)"
        />
      </template>
      <button
        v-else
        class="row file"
        :class="{ active: selected === node.path }"
        :style="{ paddingLeft: depth * 12 + 22 + 'px' }"
        @click="emit('open', node.path)"
      >
        <span class="icon">›</span>
        <span class="name">{{ node.name }}</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.tree {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  background: none;
  border: none;
  color: var(--tool-text);
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  padding: 0.18rem 0.5rem;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.row:hover {
  background: rgba(255, 255, 255, 0.05);
}
.file.active {
  background: rgba(110, 231, 183, 0.14);
  color: var(--tool-accent);
}
.twisty {
  width: 0.8em;
  color: var(--tool-muted);
}
.icon {
  color: var(--tool-muted);
}
.dir .name {
  color: var(--tool-text);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
