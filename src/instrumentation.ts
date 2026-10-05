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
