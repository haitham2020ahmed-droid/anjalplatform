/** Node.js only (see instrumentation.ts): keeps a server error in the error log. Never throws. */
export async function logRequestError(err: unknown, request: { path?: string }): Promise<void> {
  try {
    const [{ repo }, { logError }] = await Promise.all([import("./server/auth/next"), import("./server/teacher/extras")]);
    const e = err as { message?: string; digest?: string };
    await logError(repo, { source: "SERVER", message: String(e?.message ?? err), path: request?.path ?? null, digest: e?.digest ?? null });
  } catch { /* never throw from the error hook */ }
}

/**
 * 🚀 The one-time jobs after an update (r68: ON by default), 2 minutes after the start, one after another through the
 * light job runner (src/server/jobs/startup.ts → runner.ts). Never throws.
 */
export function startBackgroundJobs(): void {
  void import("./server/jobs/startup").then(({ scheduleStartupJobs }) => scheduleStartupJobs(async () => (await import("./server/auth/next")).repo)).catch(() => undefined);
}

/** ⭐ Skill stars: every school never migrated gets its statuses from the practice data (once, through the job runner). Never throws. */
export async function migrateStarsInBackground(): Promise<void> {
  try {
    const [{ repo }, { migrateOnce }] = await Promise.all([import("./server/auth/next"), import("./server/skills/status-extras")]);
    await migrateOnce(repo);
  } catch { /* the next start (or the System check button) tries again */ }
}

/** ✏️ Old teacher copies become private (src/server/questions/private-copies.ts), through the job runner. Never throws. */
export async function privatizeCopiesInBackground(): Promise<void> {
  try {
    const [{ repo }, { runJobEverywhere }, { PRIVATIZE_JOB }] = await Promise.all([import("./server/auth/next"), import("./server/jobs/runner"), import("./server/jobs/startup")]);
    await runJobEverywhere(repo, PRIVATIZE_JOB);
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
