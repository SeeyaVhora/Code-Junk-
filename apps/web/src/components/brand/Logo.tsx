import { cn } from "@/lib/cn";

/** Code Junk mark: a chevron prompt and a cursor, the start of something you're about to write. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M13 10l-6 6 6 6"
        fill="none"
        className="stroke-paper"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="16" y="19.5" width="9" height="2.6" rx="1.3" className="cj-cursor fill-accent" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight text-ink">Code Junk</span>
    </span>
  );
}
