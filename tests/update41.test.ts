/**
 * Update 41 (FAKE data only — the Test School; Gemini is a fake fetch, offline):
 *   - the Fluency Coach's Gemini call: thinking settings per model, truncated / thinking-only replies, audio types
 *     from Safari/iPad, 401/404 configuration errors, the time limit under the proxy's 100 s, and what the student sees;
 *   - the admin's AI error list and the connection test (one second of generated silence);
 *   - ReadMaster: teachers mark articles "Ready for review" (admins notified once), friendly permission messages.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { assertCan, ForbiddenError, friendlyForbidden, permissionMessage, type Actor } from "../src/server/auth/rbac";
import { ValidationError } from "../src/server/curriculum-admin";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, requestArticleReview, REVIEW_NOTICE, saveArticle, saveVersion, setArticleStatus, setArticlesStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { CoachProviderError, FLUENCY_MAX_OUTPUT_TOKENS, classifyGeminiFailure, coachHome, geminiAudioMime, geminiAudioScorer, scoreReading, silentWav, testCoachConnection, thinkingConfigFor, type AudioScorer } from "../src/server/fluency/coach";
import { aiErrors } from "../src/server/ai/jobs";
import { setAiSettings } from "../src/server/ai/engine";
import { demoDatabase } from "./helpers/db";

const ENV = { GEMINI_API_KEY: "AIzaTEST" };
const WORDS = ["Omar", "flew", "his", "red", "kite", "in", "the", "park."];
const GOOD = JSON.stringify({ lastWordIndex: 7, errors: [{ i: 4, kind: "MISPRONOUNCED", heard: "kit" }], hesitations: [], expression: 3, prosody: null, patterns: ["silent e"] });
const MP4 = (() => { const b = new Uint8Array(64); b.set([0, 0, 0, 0x20], 0); b.set([...("ftypM4A ")].map((c) => c.charCodeAt(0)), 4); return b; })();

type Call = { url: string; body: Record<string, any> };
/** A fake fetch: each call gets the next reply (status + JSON or text), the requests are kept. */
function fakeFetch(replies: ({ status: number; json?: unknown; text?: string } | "hang")[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r === "hang") return new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))));
    const text = r.text ?? JSON.stringify(r.json);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, text: async () => text, json: async () => JSON.parse(text) } as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const reply = (parts: { text: string; thought?: boolean }[], finishReason = "STOP") => ({ status: 200, json: { candidates: [{ content: { parts }, finishReason }] } });

describe("🎙 Fluency Coach · the Gemini connection", () => {
  test("thinking settings per model: 2.5 Flash off, 2.5 Pro the smallest budget, 3.x low, unknown untouched", () => {
    assert.deepEqual(thinkingConfigFor("gemini-2.5-flash"), { thinkingBudget: 0 });
    assert.deepEqual(thinkingConfigFor("gemini-2.5-flash-lite"), { thinkingBudget: 0 });
    assert.deepEqual(thinkingConfigFor("gemini-2.5-pro"), { thinkingBudget: 128 });
    assert.deepEqual(thinkingConfigFor("gemini-3.5-flash"), { thinkingLevel: "low" });
    assert.deepEqual(thinkingConfigFor("gemini-3-flash-preview"), { thinkingLevel: "low" });
    assert.equal(thinkingConfigFor("gemini-flash-latest"), null);
  });

  test("audio types: codecs removed, Safari/iPad names mapped, the file's own bytes trusted", () => {
    assert.equal(geminiAudioMime("audio/webm;codecs=opus"), "audio/webm");
    assert.equal(geminiAudioMime("audio/x-m4a"), "audio/mp4");
    assert.equal(geminiAudioMime("audio/mp4; codecs=\"mp4a.40.2\""), "audio/mp4");
    assert.equal(geminiAudioMime("audio/aac"), "audio/aac");
    assert.equal(geminiAudioMime("audio/mpeg"), "audio/mp3");
    assert.equal(geminiAudioMime("", silentWav(0.1)), "audio/wav", "no label: the WAV header says it");
    assert.equal(geminiAudioMime("audio/webm", MP4), "audio/mp4", "an iPad recording labelled webm is really mp4");
    assert.equal(geminiAudioMime("text/plain"), null);
    const w = silentWav(1);
    assert.equal(w.length, 44 + 32000);
    assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  });

  test("a 2.5 model: thinking off, room for the answer, JSON mode, the mp4 type sent without codecs", async () => {
    const { f, calls } = fakeFetch([reply([{ text: GOOD }])]);
    const scorer = geminiAudioScorer({ ...ENV, GEMINI_MODEL: "gemini-2.5-flash" }, f)!;
    const m = await scorer({ words: WORDS, audio: MP4, mime: "audio/mp4;codecs=mp4a.40.2" });
    assert.equal(m.errors[0].i, 4);
    const g = calls[0].body.generationConfig;
    assert.deepEqual(g.thinkingConfig, { thinkingBudget: 0 });
    assert.equal(g.maxOutputTokens, FLUENCY_MAX_OUTPUT_TOKENS);
    assert.equal(g.responseMimeType, "application/json");
    assert.equal(g.temperature, 0);
    assert.equal(calls[0].body.contents[0].parts[1].inline_data.mime_type, "audio/mp4");
    assert.match(calls[0].url, /models\/gemini-2\.5-flash:generateContent$/);
    assert.match(calls[0].body.systemInstruction.parts[0].text, /list ONLY the words with errors/);
    assert.doesNotMatch(JSON.stringify(calls[0].body.contents[0].parts[0]), /student|name/i, "only the passage words and the audio");
  });

  test("Gemini 3: the low thinking level and the default temperature; thinking parts are left out", async () => {
    const { f, calls } = fakeFetch([reply([{ text: "Let me listen…", thought: true }, { text: GOOD }])]);
    const m = await geminiAudioScorer(ENV, f)!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" });
    assert.equal(m.lastWordIndex, 7);
    assert.deepEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: "low" });
    assert.equal(calls[0].body.generationConfig.temperature, undefined);
  });

  test("a truncated JSON reply is asked again with the reason; two bad replies → INVALID with MAX_TOKENS named", async () => {
    const cut = GOOD.slice(0, 40);
    const a = fakeFetch([reply([{ text: cut }], "MAX_TOKENS"), reply([{ text: GOOD }])]);
    const m = await geminiAudioScorer(ENV, a.f)!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" });
    assert.equal(m.lastWordIndex, 7);
    assert.match(JSON.parse(a.calls[1].body.contents[0].parts[0].text).yourPreviousReplyWasRejectedBecause, /MAX_TOKENS/);
    const b = fakeFetch([reply([{ text: "thinking only", thought: true }], "MAX_TOKENS")]);
    await assert.rejects(geminiAudioScorer(ENV, b.f)!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" }), (e: unknown) => e instanceof CoachProviderError && e.kind === "INVALID" && /MAX_TOKENS/.test(e.message));
    assert.equal(b.calls.length, 2, "two answers at most");
  });

  test("a model that refuses the thinking settings is asked once more without them", async () => {
    const { f, calls } = fakeFetch([{ status: 400, text: '{"error":{"message":"Unknown name \\"thinkingLevel\\" at generation_config.thinking_config"}}' }, reply([{ text: GOOD }])]);
    await geminiAudioScorer(ENV, f)!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.generationConfig.thinkingConfig, undefined);
  });

  test("configuration errors: 404 model, 401/403 and 400 invalid key → CONFIG in plain English (never the key)", async () => {
    const run = async (status: number, text: string) => { const { f } = fakeFetch([{ status, text }]); try { await geminiAudioScorer({ ...ENV, GEMINI_MODEL: "gemini-1.0-pro" }, f)!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" }); } catch (e) { return e as CoachProviderError; } throw new Error("no error"); };
    const nf = await run(404, '{"error":{"code":404,"message":"models/gemini-1.0-pro is not found for API version v1beta","status":"NOT_FOUND"}}');
    assert.equal(nf.kind, "CONFIG"); assert.match(nf.message, /model “gemini-1\.0-pro” was not found.*GEMINI_MODEL/);
    const k401 = await run(401, "unauthorized");
    assert.equal(k401.kind, "CONFIG"); assert.match(k401.message, /GEMINI_API_KEY/);
    const k400 = await run(400, '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}');
    assert.equal(k400.kind, "CONFIG");
    for (const e of [nf, k401, k400]) assert.doesNotMatch(e.message, /AIzaTEST/);
    assert.equal((await run(429, "RESOURCE_EXHAUSTED")).kind, "RATE_LIMIT");
    assert.equal((await run(503, "overloaded")).kind, "DOWN");
    assert.equal(classifyGeminiFailure(400, "Unsupported MIME type: audio/x-foo", "m").kind, "REQUEST");
  });

  test("the time limit: no answer in time → TIMEOUT (under the proxy's 100 s)", async () => {
    const { f } = fakeFetch(["hang"]);
    const keep = setInterval(() => {}, 1000);   // AbortSignal.timeout's timer does not hold the test process open
    after(() => clearInterval(keep));
    await assert.rejects(geminiAudioScorer(ENV, f, { timeoutMs: 40 })!({ words: WORDS, audio: silentWav(1), mime: "audio/wav" }), (e: unknown) => e instanceof CoachProviderError && e.kind === "TIMEOUT");
  });
});

describe("🎙 Fluency Coach · what the student and the admin see", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let st: Actor; let key: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const r = await teacherRoster(repo, teacher);
    st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: r[0].students[0].id }))!.userId }))!);
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: st.studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-KITE41", title: "Omar's Kite", grade });
    const v = await saveVersion(repo, admin, art, "ON", { lexile: 700, body: "Omar had a red kite. Every windy day he ran to the park with his little sister. The kite climbed high above the trees, and the long tail danced in the wind. One day the string broke and the kite flew away over the houses. Omar was sad, but his sister helped him build a new one from paper and sticks. It was even better than the first." });
    await addVersionQuestion(repo, admin, v, { stem: "What broke?", whyCorrect: "The string.", options: [{ label: "A", text: "The string", correct: true }, { label: "B", text: "The tree", correct: false, rationale: "No." }] });
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    key = (await coachHome(repo, st, ENV)).passages.find((p) => p.title.startsWith("Omar's Kite"))!.key;
  });
  const input = () => ({ key, mode: "PASSAGE" as const, seconds: 30, audio: silentWav(1), mime: "audio/wav" });
  const failing = (kind: "CONFIG" | "TIMEOUT" | "INVALID", msg: string): AudioScorer => async () => { throw new CoachProviderError(kind, msg); };

  test("a configuration error: the student is told the coach is not set up; admins get ONE notice; the reason is logged", async () => {
    const before = await repo.count("Notification", { title: "🎙 The Fluency Coach is not set up correctly" });
    for (let i = 0; i < 2; i++) await assert.rejects(scoreReading(repo, st, input(), { ...ENV, GEMINI_MODEL: "gemini-x" }, { scorer: failing("CONFIG", "CONFIG: The Gemini model “gemini-x” was not found (HTTP 404).") }), (e: unknown) => e instanceof ValidationError && e.message === "The Fluency Coach is not set up correctly. Your teacher has been told.");
    const admins = await repo.count("User", { schoolId: admin.schoolId, role: "SCHOOL_ADMIN", isActive: true });
    assert.equal(await repo.count("Notification", { title: "🎙 The Fluency Coach is not set up correctly" }) - before, admins, "deduplicated: one per admin while unread");
    const errs = await aiErrors(repo, admin, 50);
    assert.equal(errs[0].tool, "fluency"); assert.equal(errs[0].toolName, "Fluency Coach"); assert.equal(errs[0].model, "gemini-x");
    assert.match(errs[0].error, /was not found/);
    await assert.rejects(aiErrors(repo, teacher, 50), ForbiddenError, "admins only");
  });

  test("a timeout waits and tries again by itself; other failures keep 'try again'", async () => {
    const w = await scoreReading(repo, st, input(), ENV, { scorer: failing("TIMEOUT", "TIMEOUT: Gemini did not answer within 80 seconds.") });
    assert.equal(w.status, "WAIT"); assert.equal((w as { timeout?: boolean }).timeout, true);
    await assert.rejects(scoreReading(repo, st, input(), ENV, { scorer: failing("INVALID", "INVALID: bad") }), /try again in a moment/);
    await assert.rejects(scoreReading(repo, st, { ...input(), mime: "audio/x-m4a", audio: MP4 }, ENV, { scorer: failing("INVALID", "INVALID: bad") }), /try again in a moment/, "an iPad m4a recording is accepted");
  });

  test("the admin's connection test: OK, or the exact reason in plain English", async () => {
    const ok = fakeFetch([reply([{ text: JSON.stringify({ lastWordIndex: -1, errors: [], expression: null, prosody: null, patterns: [] }) }])]);
    const r = await testCoachConnection(repo, admin, ENV, ok.f);
    assert.equal(r.ok, true); assert.match(r.message, /^OK: Gemini \(gemini-3\.5-flash\)/);
    assert.equal(ok.calls[0].body.contents[0].parts[1].inline_data.mime_type, "audio/wav");
    const bad = fakeFetch([{ status: 404, text: "not found" }]);
    const r2 = await testCoachConnection(repo, admin, { ...ENV, GEMINI_MODEL: "gemini-old" }, bad.f);
    assert.equal(r2.ok, false); assert.match(r2.message, /^The Gemini model “gemini-old” was not found/);
    const none = await testCoachConnection(repo, admin, {}, bad.f);
    assert.match(none.message, /GEMINI_API_KEY is not set/);
    await assert.rejects(testCoachConnection(repo, teacher, ENV, ok.f), ForbiddenError);
  });
});

describe("⭐ ReadMaster review flow · friendly permission messages", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let art: string; let empty: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    art = await saveArticle(repo, teacher, { code: "RM-REV41", title: "The Desert Fox", grade: 5 });
    const v = await saveVersion(repo, teacher, art, "ON", { lexile: 800, body: "The desert fox has very big ears. They help it hear small animals under the sand and keep it cool in the hot sun." });
    await addVersionQuestion(repo, teacher, v, { stem: "Why are the ears big?", whyCorrect: "To hear and keep cool.", options: [{ label: "A", text: "To hear and keep cool", correct: true }, { label: "B", text: "To fly", correct: false, rationale: "No." }] });
    empty = await saveArticle(repo, teacher, { code: "RM-EMPTY41", title: "Empty Article", grade: 5 });
  });

  test("a teacher cannot publish: a friendly sentence, never the permission code", async () => {
    for (const p of [setArticleStatus(repo, teacher, art, "PUBLISHED"), setArticlesStatus(repo, teacher, [art], "PUBLISHED")]) {
      await assert.rejects(p, (e: unknown) => e instanceof ForbiddenError && e.message === "You don't have permission to publish. Ask an admin." && e.permission === "questions:publish");
    }
    assert.throws(() => assertCan(teacher, "settings:engine"), (e: unknown) => !/[a-z]+:[a-z]+/.test((e as Error).message));
    assert.equal(permissionMessage("students:manage"), "You don't have permission to manage students. Ask an admin.");
    assert.equal(friendlyForbidden("Missing permission: questions:publish"), "You don't have permission to publish. Ask an admin.");
    assert.equal(friendlyForbidden("Article not found."), "Article not found.");
  });

  test("the teacher marks articles ready for review; admins are told once; an admin publishes", async () => {
    const r = await requestArticleReview(repo, teacher, [art, empty]);
    assert.deepEqual([r.changed, r.skipped], [1, ["Empty Article"]]);
    assert.equal((await repo.findUnique("ReadMasterArticle", { id: art }))!.status, "REVIEW");
    const admins = await repo.count("User", { schoolId: admin.schoolId, role: "SCHOOL_ADMIN", isActive: true });
    assert.equal(r.notified, admins);
    const n = await repo.findMany("Notification", { title: REVIEW_NOTICE });
    assert.equal(n.length, admins); assert.match(String(n[0].body), /The Desert Fox/); assert.match(String(n[0].link), /\/admin\/readmaster\?grade=5/);
    // again (already in review): nothing new; another article while the notice is unread: no second notice
    assert.equal((await requestArticleReview(repo, teacher, [art])).changed, 0);
    const other = await saveArticle(repo, teacher, { code: "RM-REV41B", title: "Camels", grade: 5 });
    const v = await saveVersion(repo, teacher, other, "ON", { lexile: 800, body: "Camels can walk for many days in the hot desert without water because their bodies save every drop they drink and their humps store fat for energy." });
    await addVersionQuestion(repo, teacher, v, { stem: "What do camels save?", whyCorrect: "Water.", options: [{ label: "A", text: "Water", correct: true }, { label: "B", text: "Sand", correct: false, rationale: "No." }] });
    const r2 = await requestArticleReview(repo, teacher, [other]);
    assert.deepEqual([r2.changed, r2.notified], [1, 0]);
    assert.equal(await repo.count("Notification", { title: REVIEW_NOTICE }), admins);
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    assert.equal((await repo.findUnique("ReadMasterArticle", { id: art }))!.status, "PUBLISHED");
    await assert.rejects(requestArticleReview(repo, teacher, []), ValidationError);
  });
});
