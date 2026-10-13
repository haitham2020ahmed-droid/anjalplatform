/**
 * The kinds of assigned work My Work lists besides skills and sets of questions (student/all-work.ts), with the chip
 * each row shows. Client-safe (no server imports). The labels are interface strings (translated in the page).
 */
export type WorkKind = "TEST" | "MAP_TEST" | "NAFS_TEST" | "NAFS_PRACTICE" | "READRISE" | "WRITING" | "READ_ALOUD" | "EXIT_TICKET" | "RESPOND" | "LESSON" | "PLAN" | "SURVEY";

export const WORK_KIND_LABEL: Record<WorkKind, string> = {
  TEST: "Test", MAP_TEST: "MAP Test", NAFS_TEST: "NAFS test", NAFS_PRACTICE: "NAFS practice", READRISE: "ReadRise", WRITING: "Writing",
  READ_ALOUD: "Reading aloud", EXIT_TICKET: "Exit ticket", RESPOND: "Respond to Reading", LESSON: "Lesson", PLAN: "Plan", SURVEY: "Survey",
};
export const WORK_KINDS = Object.keys(WORK_KIND_LABEL) as WorkKind[];
