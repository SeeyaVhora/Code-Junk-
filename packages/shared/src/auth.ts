import { z } from "zod";

/** Auth request schemas, used by the web forms and the API validators alike. */

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .pipe(z.email("Enter a valid email address."))
  .transform((e) => e.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Include at least one letter and one number.");

export const nameSchema = z.string().trim().min(1, "Name is required.").max(80, "Name is too long.");

/** IANA time zone, validated by the runtime's Intl database. */
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone.");

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  timeZone: timeZoneSchema.optional(),
});
export type SignUpInput = z.input<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  // Do not apply strength rules on sign-in; only check it is present.
  password: z.string().min(1, "Password is required.").max(128),
});
export type SignInInput = z.input<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

/** Public shape of the signed-in user returned by the API. Never includes secrets. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  preferences: {
    timeZone: string;
    theme: "SYSTEM" | "LIGHT" | "DARK";
  } | null;
}

/** Error envelope returned by every API failure. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
