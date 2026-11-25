import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthUser, ForgotPasswordInput, ResetPasswordInput, SignInInput, SignUpInput } from "@code-junk/shared";
import { api, ApiError } from "@/lib/api";

export const sessionKey = ["auth", "me"] as const;

/** The signed-in user, or null when signed out. Other errors surface as query errors. */
export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return (await api<{ user: AuthUser }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });
}

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => api<{ user: AuthUser }>("/auth/signin", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      qc.clear(); // never let a previous account's cached data leak into this one
      qc.setQueryData(sessionKey, user);
    },
  });
}

export function useSignUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) => api<{ user: AuthUser }>("/auth/signup", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      qc.clear();
      qc.setQueryData(sessionKey, user);
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<unknown>("/auth/signout", { method: "POST" }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(sessionKey, null);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => api<unknown>("/auth/forgot-password", { method: "POST", body: input }),
  });
}

export function useResetPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => api<void>("/auth/reset-password", { method: "POST", body: input }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(sessionKey, null); // the reset signed out every session
    },
  });
}

/** Only allow same-app relative redirects, never `//evil.com` or absolute URLs. */
export function safeNext(next: string | null, fallback = "/app") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
