import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink, Container } from "@/components/ui";

// Placeholders until real destinations exist.
const GITHUB_URL = "https://github.com/";
const CONTACT_EMAIL = "hello@example.com";

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

const linkCls = "text-sm text-ink-2 transition-colors hover:text-ink";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="py-16 sm:py-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-line bg-ink px-6 py-8 text-on-ink sm:flex-row sm:items-center sm:px-10">
          <div>
            <p className="text-xl font-semibold tracking-tight">Collect knowledge. Practise consistently. Build mastery.</p>
            <p className="mt-1.5 text-sm opacity-70">Start your coding journal today. It takes a minute.</p>
          </div>
          <ButtonLink
            to="/signup"
            size="lg"
            className="bg-paper text-ink hover:bg-paper/90"
            rightIcon={<ArrowRight />}
          >
            Get Started
          </ButtonLink>
        </div>

        <div className="mt-16 grid gap-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted">Your code. Your knowledge. Your journey.</p>
          </div>
          <nav aria-label="Product">
            <p className="font-mono text-xs text-muted">product</p>
            <ul className="mt-3 space-y-2.5">
              <li><a href="#features" className={linkCls}>Features</a></li>
              <li><a href="#how-it-works" className={linkCls}>How It Works</a></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="font-mono text-xs text-muted">company</p>
            <ul className="mt-3 space-y-2.5">
              <li><a href="#about" className={linkCls}>About</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>Contact</a></li>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={`${linkCls} inline-flex items-center gap-1.5`}>
                  <GitHubIcon className="size-3.5" /> GitHub
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="font-mono text-xs text-muted">legal</p>
            <ul className="mt-3 space-y-2.5">
              <li><Link to="/privacy" className={linkCls}>Privacy Policy</Link></li>
              <li><Link to="/terms" className={linkCls}>Terms</Link></li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-2 border-t border-line pt-6 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Code Junk</p>
          <p className="font-mono">built for students who write code</p>
        </div>
      </Container>
    </footer>
  );
}
