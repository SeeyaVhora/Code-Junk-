import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted shadow-xs " +
  "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
  "focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, "min-h-24 py-2.5", className)} {...props} />;
  },
);

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Render prop receives ids so the control is labelled and described accessibly. */
  children: (ids: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired up with aria attributes. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": hint || error ? msgId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={msgId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
