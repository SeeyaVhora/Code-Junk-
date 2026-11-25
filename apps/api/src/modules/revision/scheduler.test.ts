import { describe, expect, it } from "vitest";
import { INITIAL_STATE, nextSchedule, type ScheduleState } from "./scheduler.ts";

const run = (verdicts: ("CORRECT" | "PARTIAL" | "INCORRECT")[], mark: "RED" | "YELLOW" | "GREEN" | null = null) => {
  let s: ScheduleState & { status?: string } = { ...INITIAL_STATE };
  for (const v of verdicts) s = nextSchedule(s, v, "INTERMEDIATE", mark);
  return s as ReturnType<typeof nextSchedule>;
};

describe("spaced repetition scheduler", () => {
  it("brings an incorrect answer back tomorrow and counts a lapse", () => {
    const s = run(["INCORRECT"]);
    expect(s.intervalDays).toBe(1);
    expect(s.lapses).toBe(1);
    expect(s.status).toBe("LEARNING");
  });

  it("grows the interval with consecutive correct answers", () => {
    expect(run(["CORRECT"]).intervalDays).toBe(1);
    expect(run(["CORRECT", "CORRECT"]).intervalDays).toBe(3);
    expect(run(["CORRECT", "CORRECT", "CORRECT"]).intervalDays).toBeGreaterThan(3);
  });

  it("never masters a question after a single correct answer", () => {
    expect(run(["CORRECT"]).status).not.toBe("MASTERED");
    expect(run(["INCORRECT", "CORRECT"]).status).not.toBe("MASTERED");
  });

  it("masters only after a streak with a long interval", () => {
    const s = run(["CORRECT", "CORRECT", "CORRECT", "CORRECT", "CORRECT"]);
    expect(s.repetitions).toBe(5);
    expect(s.intervalDays).toBeGreaterThanOrEqual(21);
    expect(s.status).toBe("MASTERED");
  });

  it("resets the streak on a lapse after progress", () => {
    const s = run(["CORRECT", "CORRECT", "CORRECT", "INCORRECT"]);
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBe(1);
  });

  it("does not advance the streak on a partial answer", () => {
    const s = run(["CORRECT", "PARTIAL"]);
    expect(s.repetitions).toBe(1);
  });

  it("caps intervals for red and yellow marks", () => {
    const many = Array(8).fill("CORRECT") as "CORRECT"[];
    expect(run(many, "RED").intervalDays).toBeLessThanOrEqual(7);
    expect(run(many, "YELLOW").intervalDays).toBeLessThanOrEqual(21);
    expect(run(many, "RED").status).not.toBe("MASTERED");
  });

  it("keeps ease within bounds", () => {
    const s = run(Array(20).fill("INCORRECT") as "INCORRECT"[]);
    expect(s.ease).toBeGreaterThanOrEqual(1.3);
  });
});
