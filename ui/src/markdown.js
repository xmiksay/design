// Markdown rendering for chat bubbles.
//
// `html: false` means raw HTML in the source is escaped, not passed through —
// so agent output can't inject markup. Fenced code blocks are syntax-highlighted
// with highlight.js (the github-dark theme is loaded globally in App.vue).

import MarkdownIt from "markdown-it";
import hljs from "highlight.js";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch {
        /* fall through to plain escaping */
      }
    }
    return md.utils.escapeHtml(code);
  },
});

// Open links in a new tab (the SPA lives in a single localhost page).
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(text) {
  return md.render(text ?? "");
}
