import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

/** Live checklist that mirrors the shared password schema rules. */
export function PasswordRules({ value, id }: { value: string; id?: string }) {
  const rules = [
    { ok: value.length >= 10, label: "At least 10 characters" },
    { ok: /[A-Za-z]/.test(value) && /\d/.test(value), label: "A letter and a number" },
  ];
  return (
    <ul id={id} className="mt-1 flex flex-col gap-1 text-xs">
      {rules.map((r) => (
        <li key={r.label} className={cn("flex items-center gap-1.5", r.ok ? "text-mark-green" : "text-muted")}>
          {r.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
          {r.label}
          <span className="sr-only">{r.ok ? "(met)" : "(not met)"}</span>
        </li>
      ))}
    </ul>
  );
}
