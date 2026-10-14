/** Node.js only (see instrumentation.ts): keeps a server error in the error log. Never throws. */
export async function logRequestError(err: unknown, request: { path?: string }): Promise<void> {
  try {
    const [{ repo }, { logError }] = await Promise.all([import("./server/auth/next"), import("./server/teacher/extras")]);
    const e = err as { message?: string; digest?: string };
    await logError(repo, { source: "SERVER", message: String(e?.message ?? err), path: request?.path ?? null, digest: e?.digest ?? null });
  } catch { /* never throw from the error hook */ }
}

/** ⭐ Skill stars: every school never migrated gets its statuses from the practice data (once, src/server/skills/status-extras.ts). Never throws. */
export async function migrateStarsInBackground(): Promise<void> {
  try {
    const [{ repo }, { migrateOnce }] = await Promise.all([import("./server/auth/next"), import("./server/skills/status-extras")]);
    await migrateOnce(repo);
  } catch { /* the next start (or the System check button) tries again */ }
}

/** ✏️ Old teacher copies become private (src/server/questions/private-copies.ts). Never throws. */
export async function privatizeCopiesInBackground(): Promise<void> {
  try {
    const [{ repo }, { privatizeOldCopiesOnce }] = await Promise.all([import("./server/auth/next"), import("./server/questions/private-copies")]);
    await privatizeOldCopiesOnce(repo);
  } catch { /* the next start tries again */ }
}

/**
 * 🛠 “Fix stuck questions” once after an update, for every school (src/server/admin/stuck-questions.ts: classify, repair,
 * publish what passes the publish checks; never deletes). The report is on System check. Never throws.
 */
export async function fixStuckQuestionsInBackground(): Promise<void> {
  try {
    const [{ repo }, { fixStuckOnceInBackground }] = await Promise.all([import("./server/auth/next"), import("./server/admin/stuck-questions")]);
    await fixStuckOnceInBackground(repo);
  } catch { /* the next start tries again */ }
}
