import { useEffect, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import { errorMessage } from "./Toast";
import { ErrorState, Skeleton } from "./Feedback";

/** Title row used at the top of every internal page. */
export function PageHeader({ title, description, actions, eyebrow, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; className?: string }) {
  useEffect(() => {
    if (typeof title === "string") document.title = `${title} · Code Junk`;
  }, [title]);
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 font-mono text-xs text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, hint, icon, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-line bg-surface px-4 py-3.5", className)}>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10.5px] tracking-wide text-muted uppercase">{label}</p>
        {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Section with a small title row, used to group content inside pages. */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Renders loading / error / content for a query, so every page handles all three. */
export function QueryView<T>({ query, loading, children }: { query: UseQueryResult<T>; loading?: ReactNode; children: (data: T) => ReactNode }) {
  if (query.isPending) return <>{loading ?? <LoadingBlock />}</>;
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
