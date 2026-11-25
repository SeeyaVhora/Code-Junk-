import { useEffect } from "react";
import { LandingNav } from "../components/LandingNav";
import { Hero } from "../components/Hero";
import { Features } from "../components/Features";
import { HowItWorks } from "../components/HowItWorks";
import { About } from "../components/About";
import { Footer } from "../components/Footer";

export default function LandingPage() {
  useEffect(() => {
    document.title = "Code Junk — Your code. Your knowledge. Your journey.";
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-3 py-2 text-on-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <About />
      </main>
      <Footer />
    </>
  );
}
