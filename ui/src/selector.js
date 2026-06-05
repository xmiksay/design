// Build a locator for a DOM element clicked in the live preview, used by the
// "object inspect" mode to point an agent at a specific node.
//
// Plain CSS selectors can't cross shadow boundaries, and the example substrate
// renders most components into open shadow roots. So we build a *per-tree-scope*
// selector — one CSS path within each shadow root (or the document) — and join
// the scopes, outermost first, with " >> " (the conventional shadow-pierce
// combinator). e.g.  `ds-button >> button.primary`. It isn't a queryable
// selector, but it tells the agent exactly which component and inner part to fix.

function cssEscape(s) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s);
  return String(s).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

// A `tag.class:nth-of-type(n)` path from `el` up to its tree-scope boundary
// (the document's <html>, or a shadow root — `parentElement` is null there).
function selectorWithinRoot(el) {
  if (el.id) return `#${cssEscape(el.id)}`;

  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== "html") {
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`); // ids are scoped per shadow root
      break;
    }

    let part = node.tagName.toLowerCase();
    const classes = (node.getAttribute("class") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (classes.length) part += "." + classes.map(cssEscape).join(".");

    const parent = node.parentElement; // null at a shadow-root boundary
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName,
      );
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }

    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

export function computeSelector(el) {
  if (!el || el.nodeType !== 1) return "";

  const scopes = [];
  let node = el;
  while (node) {
    scopes.unshift(selectorWithinRoot(node));
    const root = node.getRootNode();
    if (root && root.host) {
      node = root.host; // cross the shadow boundary up to the host element
    } else {
      break; // reached the document
    }
  }
  return scopes.join(" >> ");
}
