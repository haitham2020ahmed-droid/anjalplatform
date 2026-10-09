/** Node.js only (see instrumentation.ts): keeps a server error in the error log. Never throws. */
export async function logRequestError(err: unknown, request: { path?: string }): Promise<void> {
  try {
    const [{ repo }, { logError }] = await Promise.all([import("./server/auth/next"), import("./server/teacher/extras")]);
    const e = err as { message?: string; digest?: string };
    await logError(repo, { source: "SERVER", message: String(e?.message ?? err), path: request?.path ?? null, digest: e?.digest ?? null });
  } catch { /* never throw from the error hook */ }
}
