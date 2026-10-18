// Markdown renderer for clinical reports / chat answers.
// Uses `marked` with GitHub-flavored markdown so tables, lists, headings, bold
// and line breaks all render. The output is wrapped in a `.md` container; the
// matching styles live in index.css and adapt to light/dark mode.

import { marked } from "marked";

marked.setOptions({
  gfm: true, // GitHub-flavored markdown → tables, etc.
  breaks: true, // single newlines become <br>
});

export function formatReport(raw: string): string {
  // marked passes raw <br> through as HTML, so it renders as a line break even
  // inside table cells (where a real newline would break the table).
  const html = marked.parse(raw || "", { async: false }) as string;
  return `<div class="md">${html}</div>`;
}
