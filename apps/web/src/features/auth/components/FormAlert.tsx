import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** Form-level message (server errors, success notices). Announced to screen readers. */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-mark-red/30 bg-mark-red-soft text-ink"
          : "border-mark-green/30 bg-mark-green-soft text-ink",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-mark-red" : "text-mark-green")} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
