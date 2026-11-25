import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/cn";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className="h-10 w-full appearance-none rounded-md border border-line bg-surface pr-9 pl-3 text-sm text-ink shadow-xs transition-[border-color,box-shadow] hover:border-line-strong focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60 aria-invalid:border-danger"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }>(function Checkbox({ label, className, ...props }, ref) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink select-none", className)}>
      <input ref={ref} type="checkbox" className="size-4 rounded border-line-strong accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
});

/** Toggle chip for multi-select lists (topics, question types). */
export function Chip({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors",
        selected ? "border-accent/50 bg-accent-soft font-medium text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Segmented control for 2-5 mutually exclusive options. */
export function Segmented<T extends string>({ value, onChange, options, className, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-md border border-line bg-surface-2 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-8 rounded-[5px] px-3 text-[13px] transition-colors", value === o.value ? "bg-surface font-medium text-ink shadow-xs" : "text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Route-based tabs: each tab is a real link, so the URL reflects the view. */
export function TabLinks({ tabs, className }: { tabs: { to: string; label: ReactNode; end?: boolean; count?: number }[]; className?: string }) {
  return (
    <nav className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-line", className)}>
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap transition-colors",
              isActive ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )
          }
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

/** Small dropdown menu. */
export function Menu({ trigger, children, align = "end" }: { trigger: (p: { onClick: () => void; "aria-expanded": boolean }) => ReactNode; children: (close: () => void) => ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {open && (
        <div role="menu" className={cn("absolute top-full z-40 mt-1 min-w-44 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-md", align === "end" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, danger, icon }: { onClick: () => void; children: ReactNode; danger?: boolean; icon?: ReactNode }) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2 [&_svg]:size-4", danger ? "text-danger" : "text-ink")}
    >
      {icon}
      {children}
    </button>
  );
}
