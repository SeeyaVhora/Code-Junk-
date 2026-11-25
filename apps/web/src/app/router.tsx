import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { Spinner } from "@/components/ui";
import { AuthPendingPage, NotFoundPage, PrivacyPage, TermsPage } from "./pages";

const LandingPage = lazy(() => import("@/features/landing/pages/LandingPage"));
const DesignSystemPage = lazy(() => import("@/features/system/DesignSystemPage"));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const routes: RouteObject[] = [
  { path: "/", element: <Lazy><LandingPage /></Lazy> },
  { path: "/signin", element: <AuthPendingPage mode="signin" /> },
  { path: "/signup", element: <AuthPendingPage mode="signup" /> },
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  ...(import.meta.env.DEV ? [{ path: "/design-system", element: <Lazy><DesignSystemPage /></Lazy> }] : []),
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
