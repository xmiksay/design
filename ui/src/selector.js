// Build a reasonably-stable CSS selector for a DOM element, used by the live
// preview's "object inspect" mode to point an agent at a specific node.
//
// Strategy: prefer an id (unique, short-circuits). Otherwise walk up the tree
// building `tag.class…:nth-of-type(n)` segments until we hit an id or <html>,
// disambiguating among same-tag siblings with :nth-of-type.

function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

export function computeSelector(el) {
  if (!el || el.nodeType !== 1) return "";
  if (el.id) return `#${cssEscape(el.id)}`;

  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== "html") {
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`);
      break;
    }

    let part = node.tagName.toLowerCase();
    const classes = (node.getAttribute("class") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (classes.length) part += "." + classes.map(cssEscape).join(".");

    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }

    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}
