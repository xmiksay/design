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
          @open="(p, m) => emit('open', p, m)"
        />
      </template>
      <div
        v-else
        class="row file"
        :class="{ active: selected === node.path }"
      >
        <button
          class="name-btn"
          :style="{ paddingLeft: depth * 12 + 22 + 'px' }"
          title="Open (default action for this file type)"
          @click="emit('open', node.path, 'default')"
        >
          <span class="icon">›</span>
          <span class="name">{{ node.name }}</span>
        </button>
        <span class="actions">
          <button
            class="act"
            title="Open source"
            @click.stop="emit('open', node.path, 'content')"
          >
            ‹/›
          </button>
          <button
            class="act"
            title="Load live preview"
            @click.stop="emit('open', node.path, 'preview')"
          >
            ▷
          </button>
        </span>
      </div>
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
/* File rows are a flex container: a stretchable name button + trailing icons. */
.row.file {
  padding: 0;
}
.name-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: var(--tool-text);
  font-family: var(--tool-mono);
  font-size: 0.8rem;
  padding: 0.18rem 0.5rem;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
}
.file.active {
  background: rgba(110, 231, 183, 0.14);
}
.file.active .name {
  color: var(--tool-accent);
}
.actions {
  display: flex;
  gap: 0.1rem;
  padding-right: 0.45rem;
  opacity: 0;
}
.row.file:hover .actions,
.file.active .actions {
  opacity: 1;
}
.act {
  background: none;
  border: none;
  color: var(--tool-muted);
  font-family: var(--tool-mono);
  font-size: 0.74rem;
  line-height: 1;
  padding: 0.12rem 0.3rem;
  border-radius: 4px;
  cursor: pointer;
}
.act:hover {
  color: var(--tool-accent);
  background: rgba(255, 255, 255, 0.08);
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
