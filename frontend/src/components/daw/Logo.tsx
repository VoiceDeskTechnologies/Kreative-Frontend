export function KMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M8 6h14v52H8z" className="fill-foreground" />
      <path d="M26 32 48 6h14L40 32l22 26H48z" className="fill-foreground" />
      <path d="M22 32 40 12v12L28 38z" className="fill-muted-foreground" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <KMark className="h-8 w-8" />
      <div className="leading-tight">
        <div className="font-display text-[13px] tracking-[0.35em]">KREATIVE</div>
        <div className="text-[9px] tracking-[0.18em] text-muted-foreground">AI MIXING & MASTERING</div>
      </div>
    </div>
  );
}
