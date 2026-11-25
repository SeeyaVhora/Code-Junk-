import { ArrowRight } from "lucide-react";
import { ButtonLink, Container, buttonClasses } from "@/components/ui";
import { ProductPreview } from "./ProductPreview";

export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="relative overflow-hidden">
      <div aria-hidden className="cj-ruled pointer-events-none absolute inset-0 -z-10 opacity-70" />
      <Container className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto max-w-4xl text-center">
          <p className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 font-mono text-xs text-ink-2 shadow-xs">
            <span className="size-1.5 rounded-full bg-accent" />
            Your code. Your knowledge. Your journey.
          </p>
          <h1
            id="hero-title"
            className="mt-6 animate-fade-up text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-ink [animation-delay:60ms] sm:text-5xl lg:text-[3.5rem]"
          >
            <span className="sm:block">Everything you learn.</span> Everything you code.{" "}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10">One place.</span>
              <span aria-hidden className="absolute inset-x-0 bottom-[0.08em] z-0 h-[0.32em] rounded-sm bg-accent-soft" />
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-160 animate-fade-up text-base leading-relaxed text-pretty text-ink-2 [animation-delay:120ms] sm:text-lg">
            Your personal coding journal and AI-powered learning companion. Save your code, generate practice
            questions, prepare for examinations and organise your learning journey.
          </p>
          <div className="mt-9 flex animate-fade-up flex-col items-stretch justify-center gap-3 [animation-delay:180ms] sm:flex-row sm:items-center">
            <ButtonLink to="/signup" size="lg" rightIcon={<ArrowRight />}>
              Get Started
            </ButtonLink>
            <a href="#features" className={buttonClasses("secondary", "lg")}>
              Explore Features
            </a>
          </div>
          <p className="mt-4 animate-fade-up text-xs text-muted [animation-delay:220ms]">
            Works with OpenAI and Google Gemini · Your data stays private to your account
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl animate-fade-up [animation-delay:280ms] sm:mt-20">
          <div aria-hidden className="absolute -inset-x-6 -top-6 -bottom-10 -z-10 rounded-[28px] bg-surface-2/70" />
          <ProductPreview />
        </div>
      </Container>
    </section>
  );
}
