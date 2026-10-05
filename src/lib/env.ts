/**
 * Validated environment.
 *
 * Validation is LAZY: importing this module never throws, so `next build` (which
 * imports every page while "collecting page data") needs no production secrets.
 * The first read of any value validates everything at once. The app still refuses
 * to boot with missing or invalid settings: src/instrumentation.ts calls loadEnv()
 * when the server starts, before any request is served.
 */
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().startsWith("mysql://"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  APP_URL: z.string().url(),
  SESSION_TTL_MINUTES: z.coerce.number().int().min(15).max(43_200).default(720),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1_440).default(60),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(3).max(50).default(8),
  LOGIN_LOCKOUT_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
  // Phase 10 reports
  REPORT_FONT_DIR: z.string().default("./assets/fonts"),
  REPORT_BRANDING_DIR: z.string().default("./storage/branding"),
  REPORT_CHROMIUM_PATH: z.string().optional(), // empty = Playwright's bundled Chromium
  REPORT_PDF_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  REPORT_CHROMIUM_NO_SANDBOX: z.enum(["true", "false"]).default("false"), // only for containers that cannot sandbox
  // AI-assisted question bank (optional; without a key the generator explains how to enable it)
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-sonnet-5-5"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Validates process.env once (throws a readable list of every problem) and caches the result. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Same API as before (`env.APP_URL`), validated on first use. */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key) => loadEnv()[key as keyof Env],
  has: (_target, key) => key in loadEnv(),
  ownKeys: () => Reflect.ownKeys(loadEnv()),
  getOwnPropertyDescriptor: (_target, key) => ({ ...Reflect.getOwnPropertyDescriptor(loadEnv(), key), configurable: true }),
});
