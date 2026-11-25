import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { ChevronDown, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/cn";
import type { AuthUser } from "@code-junk/shared";
import { NAV, type NavItem } from "../nav";

function isWithin(pathname: string, to: string, end?: boolean) {
  return end ? pathname === to : pathname === to || pathname.startsWith(to + "/");
}

function Item({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const active = isWithin(pathname, item.to, item.end);
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const base = "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors";
  if (!item.children) {
    return (
      <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => cn(base, isActive ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink")}>
        <item.icon className="size-4 shrink-0" aria-hidden />
        {item.label}
      </NavLink>
    );
  }
  const id = `nav-${item.to.replace(/\W/g, "-")}`;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className={cn(base, active ? "font-medium text-ink" : "text-ink-2 hover:bg-surface-2/60 hover:text-ink")}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul id={id} className="my-0.5 ml-[1.15rem] border-l border-line pl-2">
          {item.children.map((c) => (
            <li key={c.to}>
              <NavLink
                to={c.to}
                end={c.end}
                onClick={onNavigate}
                className={({ isActive }) => cn("flex h-8 items-center rounded-md px-2.5 text-[13px] transition-colors", isActive ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink")}
              >
                {c.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sidebar({ user, onNavigate, onSignOut }: { user: AuthUser; onNavigate: () => void; onSignOut: () => void }) {
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <NavLink to="/app" onClick={onNavigate} aria-label="Code Junk home">
          <Logo />
        </NavLink>
      </div>
      <nav aria-label="Application" className="flex-1 overflow-y-auto px-2.5 pb-4">
        {NAV.map((g) => (
          <div key={g.group} className="mt-4 first:mt-1">
            <p className="mb-1 px-2.5 font-mono text-[10.5px] tracking-wide text-muted uppercase">{g.group}</p>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <Item key={i.to} item={i} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-2.5">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">{initials}</span>
          )}
          <NavLink to="/app/settings" onClick={onNavigate} className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </NavLink>
          <button type="button" onClick={onSignOut} aria-label="Sign out" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
