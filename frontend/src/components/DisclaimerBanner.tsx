/** Standing "not a diagnosis" safety banner shown on AI surfaces. */
export default function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-line bg-app px-3 py-2 text-[12px] text-muted">
      <span className="material-symbols-outlined text-base text-accent-700">info</span>
      <span>
        AI-generated decision support not a medical diagnosis. Confidence and sources are shown
        where available. Always confirm with a clinician.
      </span>
    </div>
  );
}
