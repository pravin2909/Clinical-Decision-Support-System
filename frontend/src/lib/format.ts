// Lightweight Markdown-ish renderer for the clinical report.
// Uses theme tokens so it reads well in both light and dark mode.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-content">$1</strong>');
}

export function formatReport(raw: string): string {
  const lines = escapeHtml(raw).split("\n");
  const out: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      closeList();
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeList();
      out.push('<hr class="my-5 border-line" />');
      continue;
    }
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h4 class="font-semibold text-content mt-4 mb-1">${inline(line.slice(4))}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(
        `<h3 class="flex items-center gap-2 text-content font-bold text-base mt-6 mb-2">
          <span class="inline-block w-1.5 h-4 rounded bg-accent-400"></span>${inline(line.slice(3))}
        </h3>`
      );
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h2 class="text-xl font-extrabold text-content mt-1 mb-2">${inline(line.slice(2))}</h2>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      out.push(
        `<blockquote class="my-3 text-xs text-muted bg-surface2 border border-line rounded-lg px-3 py-2">${inline(
          line.slice(2)
        )}</blockquote>`
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!listOpen) {
        out.push('<ul class="list-disc pl-5 space-y-1 my-2 text-muted">');
        listOpen = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="mb-3 text-muted leading-relaxed">${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}
