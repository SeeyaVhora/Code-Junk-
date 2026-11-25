import type { AiProvider } from "../src/ai/provider.ts";

/**
 * Deterministic stand-in for OpenAI/Gemini, used only by tests (setAiProviderForTests
 * refuses to run outside NODE_ENV=test). It answers in the same JSON contracts.
 */
export function fakeAi(opts: { evaluation?: "CORRECT" | "PARTIAL" | "INCORRECT" } = {}): AiProvider {
  let n = 0;
  return {
    name: "OPENAI",
    model: "fake-model",
    async completeJson({ system, user }) {
      if (/grading one student answer/.test(system)) {
        const verdict = opts.evaluation ?? "PARTIAL";
        return {
          model: "fake-model",
          text: JSON.stringify({
            verdict,
            score: verdict === "CORRECT" ? 95 : verdict === "PARTIAL" ? 60 : 10,
            feedback: "Fake evaluation.",
            mistakes: verdict === "CORRECT" ? [] : [{ location: "line 1", description: "Missing detail." }],
            criteriaResults: [],
            concepts: ["interfaces"],
            improvements: ["Explain implicit satisfaction."],
          }),
        };
      }
      const count = Number(/exactly (\d+)/.exec(user)?.[1] ?? 3);
      const marks = Number(/"marks" to (\d+)/.exec(user)?.[1] ?? 0) || null;
      const types = (/Question types for this section: ([A-Z_, ]+)\./.exec(user)?.[1] ?? "MCQ, OUTPUT_PREDICTION, THEORY").split(/,\s*/);
      const topic = /Topics[^:]*: ([^;\n]+)/.exec(user)?.[1]?.trim() ?? null;
      const questions = Array.from({ length: count }, (_, i) => {
        const type = types[i % types.length]!;
        const id = ++n;
        const base = { title: `Fake question ${id}`, body: `What is the answer to fake question number ${id}?`, topic, type, difficulty: "INTERMEDIATE", explanation: "Because.", concepts: ["fake"], marks };
        if (type === "MCQ") return { ...base, options: [{ id: "A", text: "Right" }, { id: "B", text: "Wrong" }], correctOptionIds: ["A"] };
        if (type === "OUTPUT_PREDICTION") return { ...base, expectedAnswer: "42" };
        return { ...base, expectedAnswer: "A reference answer.", evaluationCriteria: [{ criterion: "Correctness", weight: 100 }] };
      });
      return { model: "fake-model", text: JSON.stringify({ questions }) };
    },
  };
}
