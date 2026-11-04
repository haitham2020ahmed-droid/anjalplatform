import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/server/auth/http";
import { apiActor, repo } from "@/server/auth/next";
import { assertCan, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { submitAnswer, submitQuizAnswer } from "@/server/practice/session";
import { parseAnswerInput } from "@/server/practice/answer-input";
import { log } from "@/server/monitoring/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;

/**
 * POST /api/practice/answer — one answer of the practice player (`kind: "practice"`: sessionId, questionId, response) or
 * of a question set (`kind: "quiz"`: assignmentId, questionId, response). r68 (150 students at once): the players send
 * answers HERE with a plain fetch instead of a Server Action — Next.js runs a page's Server Actions one after another,
 * so one answer waiting on a busy server held every later click (the stuck "Checking…" / faded button); a fetch can be
 * timed out and sent again (the server applies each answer once: a repeat gets that answer's saved result).
 *
 *   200 { feedback, view }       the answer (or the saved result of a repeat)
 *   200 { error }                a message for the student (the question changed, the practice is not theirs …)
 *   401 { signedOut: true }      the session ended: sign in again
 *   503 { retry: true }          the server is busy (the player tries again by itself)
 */
export async function POST(req: Request) {
  const actor = await apiActor().catch(() => null);
  if (!actor || actor.role !== "STUDENT") return NextResponse.json({ error: "Please sign in again.", signedOut: true }, { status: 401 });
  // the request comes from this site (APP_URL); a 403 here makes the player use the Server Action instead
  try { assertSameOrigin({ origin: req.headers.get("origin"), referer: req.headers.get("referer") }, env.APP_URL); }
  catch { return NextResponse.json({ error: "Open the platform at its own address and try again." }, { status: 403 }); }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return NextResponse.json({ error: "This answer is too long." }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "The answer did not arrive. Try again.", retry: true }, { status: 400 }); }
  const noStore = { headers: { "Cache-Control": "no-store" } };
  try {
    if (body?.kind === "quiz") {
      assertCan(actor, "practice:take");
      return NextResponse.json(await submitQuizAnswer(repo, actor, { assignmentId: String(body.assignmentId ?? "").slice(0, 191), questionId: String(body.questionId ?? "").slice(0, 191), response: body.response }), noStore);
    }
    const input = parseAnswerInput(body);
    // hint use is read from the session on the server, never from the browser
    return NextResponse.json(await submitAnswer(repo, actor, { ...input, usedHint: false }), noStore);
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, noStore);
    // a busy or briefly unreachable database: the answer was not saved (or it was, and the repeat gets its result)
    log("error", "practice.answer_failed", { error: e, kind: String(body?.kind ?? "practice") });
    try {
      const [{ logError }] = await Promise.all([import("@/server/teacher/extras")]);
      await logError(repo, { source: "SERVER", message: String((e as Error)?.message ?? e).slice(0, 500), path: "/api/practice/answer", digest: null });
    } catch { /* the error log itself may be down */ }
    return NextResponse.json({ error: "The server is busy. Trying again…", retry: true }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } });
  }
}
