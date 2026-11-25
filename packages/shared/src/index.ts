// Shared enums and Zod schemas used by both web and api. Populated from Phase 2 onward.
export const COLOR_MARKS = ["GREEN", "YELLOW", "RED"] as const;
export type ColorMark = (typeof COLOR_MARKS)[number];

export const DIFFICULTIES = ["BEGINNER", "EASY", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
