import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink, Container, Eyebrow, ThemeToggle } from "@/components/ui";

/** Minimal chrome for standalone pages (legal, not-found, upcoming features). */
export function SimplePage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" aria-label="Code Junk home">
            <Logo />
          </Link>
          <ThemeToggle />
        </Container>
      </header>
      <main className="flex-1">
        <Container className="max-w-2xl py-20">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-2">{children}</div>
          <ButtonLink to="/" variant="secondary" className="mt-10" leftIcon={<ArrowLeft />}>
            Back to home
          </ButtonLink>
        </Container>
      </main>
    </div>
  );
}
