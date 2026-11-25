import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";

interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string | unknown) => void;
}
const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {} });

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (typeof e === "string") return e;
  return "Something went wrong. Please try again.";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  const api: ToastApi = {
    success: useCallback((m: string) => push("success", m), [push]),
    error: useCallback((m: string | unknown) => push("error", typeof m === "string" ? m : errorMessage(m)), [push]),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex animate-fade-up items-start gap-2.5 rounded-lg border bg-surface px-3.5 py-3 text-sm shadow-md",
              t.tone === "error" ? "border-mark-red/30" : "border-line",
            )}
          >
            {t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-mark-red" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-mark-green" />}
            <p className="flex-1 text-ink">{t.message}</p>
            <button aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
