/**
 * ⚡ r78: a counter moved when a NAFS test or practice is removed (deletedAt). The kept NAFS reports (dashboard.ts) key
 * on it, so a removed test / practice leaves the reports at the next view — while a NEW test or practice (no answers
 * yet) keeps them (the Suggested plan after an Assign is not computed again).
 */
let removed = 0;
export const nafsRemoved = (): void => { removed++; };
export const nafsRemovedVersion = (): number => removed;
