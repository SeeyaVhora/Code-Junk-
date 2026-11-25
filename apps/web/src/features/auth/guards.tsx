import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { ErrorState, Spinner } from "@/components/ui";
import { useSession } from "./api";

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6">{children}</div>;
}

/** Renders children only for signed-in users; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError, refetch } = useSession();
  const location = useLocation();

  if (isPending) return <FullPage><Spinner label="Loading your journal" /></FullPage>;
  if (isError) {
    return (
      <FullPage>
        <ErrorState
          className="max-w-md"
          title="Can't reach Code Junk"
          description="We couldn't check your session. The server may be down."
          onRetry={() => void refetch()}
        />
      </FullPage>
    );
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/** For sign-in/sign-up pages: signed-in users go straight to the app. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();
  if (isPending) return <FullPage><Spinner /></FullPage>;
  if (user) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
