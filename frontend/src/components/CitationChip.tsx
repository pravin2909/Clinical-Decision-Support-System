import type { Citation } from "../types";

/** A compact, clickable source chip rendered under an assistant answer. */
export default function CitationChip({ citation, index }: { citation: Citation; index: number }) {
  const label = citation.title?.replace(/<\/?[a-z]+>/gi, "").trim() || citation.url || "Source";
  const body = (
    <>
      <span className="font-semibold text-accent-700">[{index + 1}]</span>
      <span className="truncate">{label}</span>
    </>
  );
  const cls =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-app px-2.5 py-1 text-[12px] text-content";
  return citation.url ? (
    <a href={citation.url} target="_blank" rel="noreferrer" className={cls + " hover:border-accent-500"}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}
