import type { HTMLAttributes } from "react";
import type { ColorMark } from "@code-junk/shared";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "green" | "yellow" | "red" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  green: "bg-mark-green-soft text-mark-green",
  yellow: "bg-mark-yellow-soft text-mark-yellow",
  red: "bg-mark-red-soft text-mark-red",
  outline: "border border-line text-ink-2",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export const MARK_LABEL: Record<ColorMark, string> = { GREEN: "Understood", YELLOW: "Needs revision", RED: "Weak concept" };
const markTone: Record<ColorMark, BadgeTone> = { GREEN: "green", YELLOW: "yellow", RED: "red" };
const markDot: Record<ColorMark, string> = { GREEN: "bg-mark-green", YELLOW: "bg-mark-yellow", RED: "bg-mark-red" };

/** Coloured dot for question marks. Decorative: always pair it with text or an aria-label. */
export function MarkDot({ mark, className }: { mark: ColorMark; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", markDot[mark], className)} />;
}

export function MarkBadge({ mark, className }: { mark: ColorMark; className?: string }) {
  return (
    <Badge tone={markTone[mark]} className={className}>
      <MarkDot mark={mark} />
      {MARK_LABEL[mark]}
    </Badge>
  );
}
