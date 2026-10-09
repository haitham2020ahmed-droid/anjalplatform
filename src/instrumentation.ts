/**
 * Runs once when the Next.js server starts (not during `next build`).
 * Validates every setting so a misconfigured server refuses to start, with a list of
 * what is wrong, instead of failing later on the first request that needs a value.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadEnv } = await import("./lib/env");
    loadEnv();
  }
}

/**
 * Server errors of any request go to the school's error log (Admin → Errors), message and path only.
 * The Node-only code lives in instrumentation-node.ts and is imported inside a NEXT_RUNTIME check, so the Edge
 * build never includes it (it uses node:crypto through the database layer).
 */
export async function onRequestError(err: unknown, request: { path?: string }): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("./instrumentation-node");
    await logRequestError(err, request);
  }
}
