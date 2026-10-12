/**
 * Update 55 · Fluency Coach reliability (FAKE data only — the Test School; Gemini is a fake fetch, offline):
 *   - the coach says "nothing heard" but the student's device measured a clear voice → a second model listens once;
 *   - still nothing: a clear message that the voice WAS heard (read closer and clearer), not "check the microphone";
 *   - no voice measured on the device: the old answer (no second model call);
 *   - the device's live meter is trusted over a very soft file (the reading is made louder and sent).
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { coachHome, NotHeardError, scoreReading, silentWav } from "../src/server/fluency/coach";
import { setAiSettings } from "../src/server/ai/engine";
import { prepareReading } from "../src/components/fluency/audio-wav";
import { demoDatabase } from "./helpers/db";

const ENV = { GEMINI_API_KEY: "AIzaTEST" };
const reply = (o: unknown) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] }, finishReason: "STOP" }] } });
const NOTHING = reply({ lastWordIndex: -1, heardWords: 0, errors: [], hesitations: [], expression: null, prosody: null, patterns: [] });
const GOOD = reply({ lastWordIndex: 20, heardWords: 21, errors: [], hesitations: [], expression: 3, prosody: null, patterns: [] });
function fakeFetch(replies: { status: number; json: unknown }[]) {
  const models: string[] = [];
  const f = (async (url: string) => {
    models.push(decodeURIComponent(/models\/([^:]+):/.exec(String(url))?.[1] ?? ""));
    const r = replies[Math.min(models.length - 1, replies.length - 1)];
    const text = JSON.stringify(r.json);
    return { ok: true, status: r.status, text: async () => text, json: async () => JSON.parse(text) } as Response;
  }) as unknown as typeof fetch;
  return { f, models };
}

describe("🎙 Update 55 · the coach listens again before saying it heard nothing", () => {
  let repo: SqliteRepo; let st: Actor; let key = "";
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const r = await teacherRoster(repo, teacher);
    st = await resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id: r[0].students[0].id }))!.userId }))!);
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: st.studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-KITE55", title: "Lina's Kite", grade });
    const v = await saveVersion(repo, admin, art, "ON", { lexile: 700, body: "Lina had a blue kite. Every windy day she ran to the park with her little brother. The kite climbed high above the trees, and the long tail danced in the wind. One day the string broke and the kite flew away over the houses. Lina was sad, but her brother helped her build a new one from paper and sticks. It was even better than the first." });
    await addVersionQuestion(repo, admin, v, { stem: "What color was the kite?", whyCorrect: "Blue.", options: [{ label: "A", text: "Blue", correct: true }, { label: "B", text: "Red", correct: false, rationale: "No." }] });
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    key = (await coachHome(repo, st, ENV)).passages.find((p) => p.title.startsWith("Lina's Kite"))!.key;
  });
  const input = (voiced: number) => ({ key, mode: "PASSAGE" as const, seconds: 20, voiced, audio: silentWav(1), mime: "audio/wav" });

  test("a clear voice on the device + \"nothing heard\" → a second model listens, and its reading is scored", async () => {
    const { f, models } = fakeFetch([NOTHING, GOOD]);
    const r = await scoreReading(repo, st, input(6), ENV, { fetchImpl: f });
    assert.equal(r.status, "OK");
    assert.equal(models.length, 2);
    assert.notEqual(models[0], models[1], "the second opinion comes from another model");
  });

  test("still nothing: the student is told the voice was heard (read closer and clearer), not to check the microphone", async () => {
    const { f, models } = fakeFetch([NOTHING, NOTHING]);
    await assert.rejects(scoreReading(repo, st, input(6), ENV, { fetchImpl: f }), (e: unknown) => e instanceof NotHeardError && e.code === "HEARD_UNCLEAR" && /We heard your voice/.test((e as Error).message));
    assert.equal(models.length, 3, "every backup model listens (Fluency Coach expert update) before the student is told anything");
    assert.equal(new Set(models).size, 3);
  });

  test("no voice measured: no second call, the usual \"could not hear\"", async () => {
    const { f, models } = fakeFetch([NOTHING, GOOD]);
    await assert.rejects(scoreReading(repo, st, input(0), ENV, { fetchImpl: f }), (e: unknown) => e instanceof NotHeardError && /could not hear/.test((e as Error).message));
    assert.equal(models.length, 1);
  });

  test("the live meter is trusted over a very soft file", () => {
    const rate = 16000, soft = new Float32Array(rate * 3);
    for (let i = 0; i < soft.length; i++) soft[i] = 0.0015 * Math.sin(i / 7);
    assert.equal(prepareReading([soft], rate).wav, null, "alone, the file looks silent");
    const p = prepareReading([soft], rate, { trustVoice: true });
    assert.ok(p.wav && p.gain > 1, "with the meter's word, it is made louder and sent");
  });
});
