import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api";

/**
 * Routes server validation errors onto their form fields. Returns the message to show
 * at form level, or null when every error was attached to a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(error instanceof ApiError)) return "Something went wrong. Please try again.";
  const fieldErrors = error.fieldErrors;
  let unmatched = false;
  for (const [path, message] of Object.entries(fieldErrors)) {
    if ((fields as readonly string[]).includes(path)) setError(path as Path<T>, { message });
    else unmatched = true;
  }
  if (Object.keys(fieldErrors).length > 0 && !unmatched) return null;
  return error.message;
}
