export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`brand-lockup${compact ? " compact" : ""}`}
      role="img"
      aria-label="forgefit.space"
    >
      <span className="brand-symbol" aria-hidden="true">F</span>
      {!compact && (
        <span className="brand-word" aria-hidden="true">
          forgefit<span>.space</span>
        </span>
      )}
    </span>
  );
}
