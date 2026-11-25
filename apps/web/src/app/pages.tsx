import { SimplePage } from "./SimplePage";

/* Legal pages are drafts until public launch. */

export function PrivacyPage() {
  return (
    <SimplePage eyebrow="legal" title="Privacy Policy">
      <p>
        <strong className="text-ink">Draft.</strong> The full policy will be published before public launch.
      </p>
      <p>
        In short: your snippets, questions, schedule and progress belong to your account only. API keys you add are
        encrypted at rest and never shown to anyone, including you after saving. Content sent to an AI provider for
        question generation or grading is limited to what that request needs.
      </p>
    </SimplePage>
  );
}

export function TermsPage() {
  return (
    <SimplePage eyebrow="legal" title="Terms">
      <p>
        <strong className="text-ink">Draft.</strong> The full terms will be published before public launch.
      </p>
      <p>
        AI-generated practice questions and papers are original practice material. They are not real examination
        papers, and AI-assessed grades are guidance, not official marks.
      </p>
    </SimplePage>
  );
}

export function NotFoundPage() {
  return (
    <SimplePage eyebrow="404" title="This page isn't in the booklet.">
      <p>The link may be broken, or the page may have moved.</p>
    </SimplePage>
  );
}
