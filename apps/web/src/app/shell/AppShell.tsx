import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Menu as MenuIcon, PanelLeftClose, Search } from "lucide-react";
import { Button, Kbd, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/cn";
import { setUserTimeZone } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useSession, useSignOut } from "@/features/auth/api";
import { Sidebar } from "./Sidebar";
import { SearchDialog } from "./SearchDialog";
import { NotificationBell } from "./Notifications";

const COLLAPSE_KEY = "cj-sidebar-collapsed";

/**
 * Authenticated layout. The hamburger toggles the sidebar: on large screens it
 * collapses/expands it (remembered), on smaller screens it opens a drawer that
 * closes after navigating.
 */
export function AppShell() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [search, setSearch] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setDrawer(false);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const menuOpen = isDesktop ? !collapsed : drawer;

  useEffect(() => setUserTimeZone(user?.preferences?.timeZone), [user?.preferences?.timeZone]);
  // The theme saved on the account wins over this browser's copy when the app loads.
  const { setTheme } = useTheme();
  const savedTheme = user?.preferences?.theme;
  useEffect(() => {
    if (savedTheme) setTheme(savedTheme.toLowerCase() as "system" | "light" | "dark");
  }, [savedTheme, setTheme]);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
  }, [drawer]);

  if (!user) return null;
  const doSignOut = () => signOut.mutate(undefined, { onSettled: () => navigate("/", { replace: true }) });
  const toggle = () => {
    if (isDesktop) {
      setCollapsed((c) => {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
        return !c;
      });
    } else setDrawer((d) => !d);
  };

  return (
    <div className="min-h-dvh bg-paper">
      <a href="#app-main" className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface/70 transition-transform duration-200 lg:block", collapsed && "-translate-x-full")}>
        <Sidebar user={user} onNavigate={() => {}} onSignOut={doSignOut} />
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] animate-fade-in border-r border-line bg-surface shadow-lg" aria-label="Menu">
            <Sidebar user={user} onNavigate={() => setDrawer(false)} onSignOut={doSignOut} />
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-0" : "lg:pl-64")}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}>
            <span className="lg:hidden">
              <MenuIcon />
            </span>
            <span className="hidden lg:inline">{collapsed ? <MenuIcon /> : <PanelLeftClose />}</span>
          </Button>
          <button
            type="button"
            onClick={() => setSearch(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted hover:border-line-strong sm:max-w-md"
          >
            <Search className="size-4" aria-hidden />
            <span className="truncate">Search everything…</span>
            <Kbd className="ml-auto hidden sm:inline-flex">Ctrl K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main id="app-main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
      <SearchDialog open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
