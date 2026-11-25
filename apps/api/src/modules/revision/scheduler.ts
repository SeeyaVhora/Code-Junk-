import type { ColorMark, Difficulty, Verdict } from "@code-junk/shared";

/**
 * Spaced-repetition scheduling (a simplified SM-2), kept pure so it can be unit-tested.
 *
 *  - Quality comes from the verdict: CORRECT 5, PARTIAL 3, INCORRECT 1.
 *  - A failure resets the streak, counts a lapse and brings the item back tomorrow.
 *  - A partial answer neither resets nor advances the streak; the interval grows slowly.
 *  - Harder questions grow their interval more slowly.
 *  - The learner's colour mark caps the interval: RED at 7 days, YELLOW at 21.
 *  - MASTERED needs 3 consecutive correct reviews *and* an interval of at least 21 days,
 *    so one lucky answer never retires a question. Mastered items are still scheduled.
 */
export interface ScheduleState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export type RevisionState = "LEARNING" | "REVIEWING" | "MASTERED";

const QUALITY: Record<Exclude<Verdict, "UNGRADED">, number> = { CORRECT: 5, PARTIAL: 3, INCORRECT: 1 };
const DIFFICULTY_FACTOR: Record<Difficulty, number> = { BEGINNER: 1.15, EASY: 1.1, INTERMEDIATE: 1, ADVANCED: 0.85, EXPERT: 0.75 };
const MARK_CAP: Partial<Record<ColorMark, number>> = { RED: 7, YELLOW: 21 };

export const MASTERY_STREAK = 3;
export const MASTERY_INTERVAL = 21;

export function nextSchedule(
  prev: ScheduleState,
  verdict: Exclude<Verdict, "UNGRADED">,
  difficulty: Difficulty,
  mark: ColorMark | null,
): ScheduleState & { quality: number; status: RevisionState } {
  const quality = QUALITY[verdict];
  let { ease, intervalDays, repetitions, lapses } = prev;

  if (verdict === "INCORRECT") {
    repetitions = 0;
    lapses += 1;
    intervalDays = 1;
  } else if (verdict === "PARTIAL") {
    intervalDays = Math.max(1, Math.round(Math.max(intervalDays, 1) * 1.2));
  } else {
    repetitions += 1;
    const base = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(Math.max(intervalDays, 1) * ease);
    intervalDays = Math.max(1, Math.round(base * DIFFICULTY_FACTOR[difficulty]));
  }

  ease = Math.max(1.3, Math.min(3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const cap = mark ? MARK_CAP[mark] : undefined;
  if (cap) intervalDays = Math.min(intervalDays, cap);

  const status: RevisionState =
    repetitions >= MASTERY_STREAK && intervalDays >= MASTERY_INTERVAL ? "MASTERED" : repetitions === 0 ? "LEARNING" : "REVIEWING";
  return { ease: Math.round(ease * 100) / 100, intervalDays, repetitions, lapses, quality, status };
}

export const INITIAL_STATE: ScheduleState = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };
