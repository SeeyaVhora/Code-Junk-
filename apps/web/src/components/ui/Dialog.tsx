import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * Modal built on the native <dialog> element: focus trapping, Escape to close and
 * the inert backdrop come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Portalled to <body> so a dialog opened from inside a form never nests a <form> in a <form>.
  return createPortal(
    <dialog
      ref={ref}
      // React bubbles events through portals; keep a dialog's own form submits from
      // reaching a form that happens to contain the component that opened it.
      onSubmit={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-fade-up",
        { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="dialog-title" className="text-base font-semibold tracking-tight">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>,
    document.body,
  );
}

// ── Confirmation for destructive actions ────────────────────────────────────
interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {state?.body && <div className="text-sm leading-relaxed text-ink-2">{state.body}</div>}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
