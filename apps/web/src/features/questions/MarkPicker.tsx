import type { ColorMark } from "@code-junk/shared";
import { MarkDot } from "@/components/ui";
import { cn } from "@/lib/cn";

const OPTIONS: { mark: ColorMark; label: string; long: string; cls: string }[] = [
  { mark: "GREEN", label: "Understood", long: "I understand this and can solve similar questions.", cls: "border-mark-green/40 bg-mark-green-soft text-mark-green" },
  { mark: "YELLOW", label: "Needs revision", long: "I need more practice on this.", cls: "border-mark-yellow/40 bg-mark-yellow-soft text-mark-yellow" },
  { mark: "RED", label: "Weak / important", long: "Important concept I'm struggling with.", cls: "border-mark-red/40 bg-mark-red-soft text-mark-red" },
];

/** Green / Yellow / Red marking. Clicking the selected mark clears it. */
export function MarkPicker({
  value,
  suggested,
  onChange,
  disabled,
  compact,
}: {
  value: ColorMark | null;
  suggested?: ColorMark | null;
  onChange: (m: ColorMark | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Mark this question" className="flex flex-wrap items-center gap-1.5">
      {!compact && <span className="mr-1 text-xs text-muted">Mark:</span>}
      {OPTIONS.map((o) => {
        const selected = value === o.mark;
        return (
          <button
            key={o.mark}
            type="button"
            role="radio"
            aria-checked={selected}
            title={o.long}
            disabled={disabled}
            onClick={() => onChange(selected ? null : o.mark)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors disabled:opacity-50",
              selected ? cn(o.cls, "font-medium") : "border-line text-ink-2 hover:border-line-strong",
              !selected && suggested === o.mark && "border-dashed border-line-strong",
            )}
          >
            <MarkDot mark={o.mark} />
            {compact ? <span className="sr-only">{o.label}</span> : o.label}
            {!compact && !selected && suggested === o.mark && <span className="text-[10px] text-muted">suggested</span>}
          </button>
        );
      })}
    </div>
  );
}
