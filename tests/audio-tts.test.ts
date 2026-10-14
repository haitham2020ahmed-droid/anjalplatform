/**
 * Audio: natural read-aloud with Gemini TTS (request shape, cache per text + voice + speed, made on first listen,
 * fallback to the device voice), word timings, better recording (format chooser, microphone settings, level check),
 * Fluency Coach practice re-reads (never stored, never counted) and the idempotent "practice is finished" submit.
 * No network: every provider call goes to a fake fetch.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase, ROOT, seededRandom } from "./helpers/db";
import { estimateWordTimes, speechKey, speechWords, ttsCacheKey, wordAt } from "../src/lib/tts/text";
import { AUDIO_RATE } from "../src/lib/tts/voices";
import { DEFAULT_GEMINI_VOICE, geminiProvider, geminiStyle, geminiTtsBody, pickTtsProvider, type FetchLike } from "../src/server/tts/providers";
import { createOnDemandTts, MAX_ON_DEMAND_CHARS } from "../src/server/tts/on-demand";
import { findAudioMeta, findSpeechAudio } from "../src/server/tts/store";
import { parseFrom, pregenerate } from "../src/server/tts/pregenerate";
import { parseWav } from "../src/server/tts/audio";
import { audioForSpeed } from "../src/components/listen-button";
import { HEARD_MS, MIC_CONSTRAINTS, micVerdict, openMicrophone, pickRecorderMime, QUIET_AFTER_MS, RECORDER_BITRATE, recorderOptions, rms } from "../src/components/fluency/audio-capture";
import { resolveActor } from "../src/server/auth/actor";
import type { Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "../src/server/readmaster/service";
import { teacherRoster } from "../src/server/teacher/assign";
import { coachHome, improvementOf, scoreReading, type AudioScorer, type ReadingMarks } from "../src/server/fluency/coach";
import { setAiSettings } from "../src/server/ai/engine";
import { currentQuestion, endPractice, startPractice, submitAnswer } from "../src/server/practice/session";
import { loadSkillItems, type PracticeItem } from "../src/server/practice/items";
import { seedQuestions } from "../src/server/seeding/questions";
import { loadBank } from "../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../src/server/seeding/demo";

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
/** A fake Gemini: `ms` of 24 kHz PCM silence per request (or the given status). */
function fakeGemini(opts: { ms?: number; status?: number } = {}): { f: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const status = opts.status ?? 200;
    const pcm = new Uint8Array(Math.round((24_000 * 2 * (opts.ms ?? 500)) / 1000));
    const json = status < 400 ? { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: b64(pcm) } }] } }] } : { error: { message: "busy" } };
    return { ok: status < 400, status, json: async () => json, text: async () => JSON.stringify(json) };
  };
  return { f, calls };
}
const GEM = { TTS_PROVIDER: "gemini", GEMINI_API_KEY: "gem-key" };

/** The right answer for any question type (from the server-side item). */
function rightAnswer(item: PracticeItem): unknown {
  switch (item.type) {
    case "MULTIPLE_CHOICE": case "DROPDOWN": return item.options!.find((o) => o.correct)!.label;
    case "MULTI_SELECT": return item.options!.filter((o) => o.correct).map((o) => o.label);
    case "TRUE_FALSE": return item.answer;
    case "FILL_BLANK": return item.answers![0];
    case "SENTENCE_ORDER": case "WORD_ORDER": return item.sequence;
    case "ERROR_CORRECTION": return item.errorIndex;
    case "MATCHING": return Object.fromEntries(item.pairs!.map((p) => [p.left, p.right]));
    default: return null;
  }
}

describe("Gemini TTS provider", () => {
  test("request shape: model, key in a header, AUDIO modality, warm default voice, style per speed, text only", async () => {
    const { f, calls } = fakeGemini();
    const picked = pickTtsProvider(GEM, { fetchImpl: f });
    assert.ok(picked.ok);
    if (!picked.ok) return;
    assert.equal(picked.provider.voice, `gemini-2.5-flash-preview-tts:${DEFAULT_GEMINI_VOICE}`);
    const r = await picked.provider.synthesize("The fox ran home.", { speed: "slow" });
    await picked.provider.synthesize("The fox ran home.");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent");
    assert.equal(calls[0].headers["x-goog-api-key"], "gem-key");
    assert.ok(!calls[0].url.includes("gem-key"), "the key is never in the URL");
    const gc = calls[0].body.generationConfig as Record<string, unknown>;
    assert.deepEqual(gc.responseModalities, ["AUDIO"]);
    assert.deepEqual(gc.speechConfig, { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } });
    const slowText = JSON.stringify(calls[0].body.contents), normalText = JSON.stringify(calls[1].body.contents);
    assert.match(slowText, /slowly/); assert.doesNotMatch(normalText, /slowly/);
    assert.match(normalText, /The fox ran home\./);
    // PCM → a browser-playable WAV, with a word timing for every word
    assert.equal(r.mime, "audio/wav");
    assert.equal(parseWav(r.audio)!.rate, 16_000);
    assert.equal(r.timings.words.length, 4);
    // body builder and styles
    assert.deepEqual(geminiTtsBody("Hi.", "Puck", ""), { contents: [{ parts: [{ text: "Hi." }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } } } });
    assert.match(geminiStyle({ GEMINI_TTS_STYLE: "" }, "slow"), /slowly/, "Slow is slow even with an empty school style");
    assert.equal(geminiStyle({ GEMINI_TTS_STYLE: "" }, "normal"), "");
    assert.ok(geminiProvider({ GEMINI_API_KEY: "k", GEMINI_TTS_VOICE: "Puck" }).voice.endsWith(":Puck"));
  });

  test("the Gemini key is read through aiEnv(), never process.env directly", () => {
    const env = readFileSync(join(ROOT, "src/server/tts/env.ts"), "utf8");
    assert.match(env, /GEMINI_API_KEY: aiEnv\(\)\.GEMINI_API_KEY/);
    assert.doesNotMatch(env, /process\.env\.GEMINI_API_KEY/);
  });
});

describe("cache: once per text + voice + speed", () => {
  let repo: SqliteRepo;
  before(async () => { ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 })); });

  test("cache keys", async () => {
    const tk = (await speechKey("The fox ran home."))!;
    assert.equal(await ttsCacheKey(tk, "gemini:Kore", "normal"), tk, "normal audio keeps the text's own key (older audio stays valid)");
    const slowKore = await ttsCacheKey(tk, "gemini:Kore", "slow"), slowPuck = await ttsCacheKey(tk, "gemini:Puck", "slow");
    assert.match(String(slowKore), /^[0-9a-f]{64}$/);
    assert.notEqual(slowKore, tk); assert.notEqual(slowKore, slowPuck);
    assert.equal(slowKore, await ttsCacheKey(tk, "gemini:Kore", "slow"), "stable");
    assert.notEqual(await ttsCacheKey((await speechKey("Another text."))!, "gemini:Kore", "slow"), slowKore);
  });

  test("made on first listen, then served from the cache; two listeners share one request", async () => {
    const { f, calls } = fakeGemini();
    const speak = createOnDemandTts({ fetchImpl: f, perMinute: 10 });
    const text = "A small fox lived at the edge of a quiet wood.";
    const [a, b] = await Promise.all([speak(repo, GEM, text, "normal"), speak(repo, GEM, text, "normal")]);
    assert.equal(calls.length, 1, "one request for two listeners");
    assert.ok(a.status === "OK" && a.made && b.status === "OK");
    const again = await speak(repo, GEM, `  ${text}  `, "normal");
    assert.ok(again.status === "OK" && !again.made);
    assert.equal(calls.length, 1, "cached: no new request");
    const slow = await speak(repo, GEM, text, "slow");
    assert.ok(slow.status === "OK" && slow.made);
    assert.equal(calls.length, 2, "slow is its own recording");
    assert.equal(await repo.count("TtsAudio", {}), 2);
    const tk = (await speechKey(text))!;
    const both = await findSpeechAudio(repo, tk, `gemini-2.5-flash-preview-tts:${DEFAULT_GEMINI_VOICE}`);
    assert.ok(both.normal && both.slow);
    assert.equal(both.normal!.key, tk);
    // only the text went to the provider; nothing about who listened is stored
    const rows = await repo.findMany("TtsAudio", {});
    assert.ok(rows.every((r) => /^on-demand:(normal|slow)$/.test(String(r.source))));
    assert.doesNotMatch(JSON.stringify(calls.map((c) => c.body)), /studentId|userId|demo\.s\d/);
  });

  test("limits: per minute for the whole server, long texts are left to pre-generation, off switch", async () => {
    const { f, calls } = fakeGemini();
    let now = 1_000_000;
    const speak = createOnDemandTts({ fetchImpl: f, perMinute: 2, now: () => now });
    assert.equal((await speak(repo, GEM, "One.", "normal")).status, "OK");
    assert.equal((await speak(repo, GEM, "Two.", "normal")).status, "OK");
    assert.equal((await speak(repo, GEM, "Three.", "normal")).status, "BUSY");
    now += 61_000;
    assert.equal((await speak(repo, GEM, "Three.", "normal")).status, "OK");
    assert.equal(calls.length, 3);
    assert.equal((await speak(repo, GEM, "x ".repeat(MAX_ON_DEMAND_CHARS), "normal")).status, "TOO_LONG");
    assert.equal((await speak(repo, { ...GEM, TTS_ON_DEMAND: "off" }, "Four.", "normal")).status, "OFF");
    assert.equal(calls.length, 3);
  });
});

describe("fallback to the device voice", () => {
  let repo: SqliteRepo;
  before(async () => { ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 })); });

  test("no key, busy provider or refused key: nothing stored, the player keeps the device voice", async () => {
    assert.equal((await createOnDemandTts()(repo, { TTS_PROVIDER: "gemini" }, "Hello.", "normal")).status, "OFF");
    assert.equal((await createOnDemandTts()(repo, {}, "Hello.", "normal")).status, "OFF");
    const busy = fakeGemini({ status: 503 });
    assert.equal((await createOnDemandTts({ fetchImpl: busy.f })(repo, GEM, "Hello.", "normal")).status, "BUSY");
    const bad = fakeGemini({ status: 403 });
    assert.equal((await createOnDemandTts({ fetchImpl: bad.f })(repo, GEM, "Hello.", "normal")).status, "ERROR");
    assert.equal(await repo.count("TtsAudio", {}), 0);
    assert.equal(await findAudioMeta(repo, (await speechKey("Hello."))!), null);
    // the player: device voice when there is no audio or playing fails; asks for the natural voice in the background
    const src = readFileSync(join(ROOT, "src/components/listen-button.tsx"), "utf8");
    assert.match(src, /startSpeech\(0\)/);
    assert.match(src, /fetch\("\/api\/tts", \{ method: "POST"/);
    assert.match(src, /\.catch\(\(\) => \{ if \(!stopped\.current\) \{ setPre\(null\); startSpeech\(0\); \} \}\)/);
    const route = readFileSync(join(ROOT, "src/app/api/tts/route.ts"), "utf8");
    assert.match(route, /await apiActor\(\)/);
    assert.doesNotMatch(route, /studentId|userId/, "who listens is never sent or stored");
  });

  test("Slow / Normal: own recording, else the other one slowed down or sped up", () => {
    const a = (u: string) => ({ audioUrl: u, durationMs: 1000, timings: { exact: false, words: [0] } });
    assert.equal(audioForSpeed(null, "slow"), null);
    assert.deepEqual(audioForSpeed({ normal: a("n"), slow: a("s") }, "slow"), { audio: a("s"), rate: 1, own: true });
    assert.deepEqual(audioForSpeed({ normal: a("n"), slow: null }, "slow"), { audio: a("n"), rate: AUDIO_RATE.slow, own: false });
    // Update 55: the normal natural voice plays a little brisker (students found the calm pace slow)
    assert.equal(audioForSpeed({ normal: null, slow: a("s") }, "normal")!.rate, 1.27);
    assert.deepEqual(audioForSpeed({ normal: a("n"), slow: null }, "normal"), { audio: a("n"), rate: AUDIO_RATE.normal, own: true });
  });
});

describe("word highlighting timings", () => {
  test("estimated per-word start times are proportional to word length (with pauses after punctuation)", () => {
    const words = speechWords("I like elephants. Go");
    const starts = estimateWordTimes(words, 2000);
    assert.equal(starts.length, 4);
    assert.equal(starts[0], 0);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1], "in order");
    // "elephants" (9 letters) takes longer than "like" (4)
    assert.ok(starts[3] - starts[2] > starts[2] - starts[1]);
    // weights: I=3, like=6, elephants=11, (pause 6) Go=4 → total 30
    assert.deepEqual(starts, [0, 200, 600, 1733]);
    assert.ok(starts[starts.length - 1] < 2000);
    assert.equal(wordAt(starts, 650), 2);
    assert.equal(wordAt(starts, -1), -1);
    assert.deepEqual(estimateWordTimes(speechWords("one two"), 1000, 5000), [5000, 5500], "offset for later chunks");
  });
});

describe("recording: format, microphone settings, level check", () => {
  test("mimeType chooser: Opus/WebM first, MP4 for iPad/Safari, browser default otherwise", () => {
    const chrome = new Set(["audio/webm;codecs=opus", "audio/webm"]);
    const safari = new Set(["audio/mp4", "audio/mp4;codecs=mp4a.40.2"]);
    assert.equal(pickRecorderMime((t) => chrome.has(t)), "audio/webm;codecs=opus");
    assert.equal(pickRecorderMime((t) => safari.has(t)), "audio/mp4;codecs=mp4a.40.2");
    assert.equal(pickRecorderMime((t) => t === "audio/mp4"), "audio/mp4");
    assert.equal(pickRecorderMime(() => false), "");
    assert.equal(pickRecorderMime(() => { throw new Error("old browser"); }), "");
    assert.deepEqual(recorderOptions("audio/mp4"), { mimeType: "audio/mp4", audioBitsPerSecond: 64_000 });
    assert.deepEqual(recorderOptions(""), { audioBitsPerSecond: RECORDER_BITRATE });
  });

  test("microphone: clear-voice settings first, gentler settings when refused, a denied permission is not retried", async () => {
    assert.deepEqual(MIC_CONSTRAINTS[0], { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 } });
    const asked: MediaStreamConstraints[] = [];
    const stream = {} as MediaStream;
    const got = await openMicrophone(async (c) => { asked.push(c); if (asked.length < 3) throw Object.assign(new Error("x"), { name: "OverconstrainedError" }); return stream; });
    assert.equal(got, stream);
    assert.deepEqual(asked.map((c) => c.audio === true ? "basic" : Object.keys(c.audio as object).length), [5, 3, "basic"]);
    let n = 0;
    await assert.rejects(openMicrophone(async () => { n++; throw Object.assign(new Error("no"), { name: "NotAllowedError" }); }), /no/);
    assert.equal(n, 1);
  });

  test("level check: heard after a moment of speech, too quiet after a few silent seconds", () => {
    assert.equal(rms([]), 0);
    assert.ok(Math.abs(rms([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-9);
    assert.equal(micVerdict({ heardMs: HEARD_MS, elapsedMs: 500 }), "heard");
    assert.equal(micVerdict({ heardMs: 0, elapsedMs: 1000 }), "listening");
    assert.equal(micVerdict({ heardMs: 100, elapsedMs: QUIET_AFTER_MS }), "quiet");
    // fluency audio is never stored: the recorder sends it once and drops it
    const rec = readFileSync(join(ROOT, "src/components/fluency/recorder.ts"), "utf8");
    assert.match(rec, /audio\.current = null;\s+\/\/ the recording is dropped/);
    assert.doesNotMatch(rec, /localStorage|indexedDB/);
  });
});

describe("Fluency Coach: practice re-reads never count", () => {
  const TEXT = "The river was low that summer. The farmers watched the sky every morning, hoping for rain. When the clouds finally came, the whole village ran outside to dance in the first heavy drops of water. Children laughed and splashed in the puddles while their parents smiled. That night everyone slept well, listening to the steady sound of the rain on the roofs. In the morning the fields were green again and the river was full.";
  const ENV = { GEMINI_API_KEY: "AIzaTEST" };
  const AUDIO = new Uint8Array(3000).fill(5);
  const fixed = (m: Partial<ReadingMarks> & { lastWordIndex: number }): AudioScorer => async () => ({ errors: [], expression: 3, patterns: [], ...m });
  let repo: SqliteRepo; let st: Actor; let other: Actor; let key: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    const a = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    const [admin, teacher] = await Promise.all(["test.admin", "test.teacher.1"].map(a));
    await setAiSettings(repo, admin, { perMinute: 60, perDay: 10000 });
    const r = await teacherRoster(repo, teacher);
    const ids = r[0].students.slice(0, 2).map((x) => x.id);
    [st, other] = await Promise.all(ids.map(async (id) => resolveActor(repo, (await repo.findUnique("User", { id: (await repo.findUnique("Student", { id }))!.userId }))!)));
    const grade = Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Student", { id: st.studentId }))!.gradeId }))!.level);
    const art = await saveArticle(repo, admin, { code: "RM-AUDIO", title: "Rain Again", grade });
    const v = await saveVersion(repo, admin, art, "ON", { lexile: 800, body: TEXT });
    await addVersionQuestion(repo, admin, v, { stem: "When did the rain come?", whyCorrect: "After a dry summer.", options: [{ label: "A", text: "After a dry summer.", correct: true }, { label: "B", text: "In the snow.", correct: false, rationale: "No." }] });
    await setArticleStatus(repo, admin, art, "PUBLISHED");
    key = (await coachHome(repo, st, ENV)).passages.find((p) => p.title.startsWith("Rain Again"))!.key;
  });

  test("the first read counts; the practice re-read is compared but never stored or counted", async () => {
    const now = new Date();
    const first = await scoreReading(repo, st, { key, mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 49, errors: [{ i: 3, kind: "MISPRONOUNCED", heard: "x" }] }) }, now);
    assert.ok(first.status === "OK");
    if (first.status !== "OK") return;
    assert.equal(first.result.official, true);
    const before = { practice: await repo.count("FluencyPractice", { studentId: st.studentId }), checks: await repo.findMany("FluencyCheck", { studentId: st.studentId }), home: await coachHome(repo, st, ENV, now) };
    assert.equal(before.checks.length, 1);

    const again = await scoreReading(repo, st, { key: "ignored", mode: "MINUTE", seconds: 60, audio: AUDIO, mime: "audio/wav", rereadOf: first.result.id }, ENV, { scorer: fixed({ lastWordIndex: 69 }) }, new Date(now.getTime() + 60_000));
    assert.ok(again.status === "OK");
    if (again.status !== "OK") return;
    const p = again.result;
    assert.equal(p.practice, true); assert.equal(p.official, false); assert.equal(p.id, "");
    assert.equal(p.passageKey, key, "the same passage as the first read");
    assert.equal(p.wcpm, 70); assert.equal(p.accuracy, 100);
    assert.deepEqual(p.improvement, { first: { wcpm: 49, accuracy: 98 }, wcpmGain: 21, accuracyGain: 2, message: improvementOf({ wcpm: 49, accuracy: 98 }, { wcpm: 70, accuracy: 100 }).message });
    assert.match(p.improvement!.message, /21 more words/);
    // nothing written: the level, the reports and the norms only see the first read
    assert.equal(await repo.count("FluencyPractice", { studentId: st.studentId }), before.practice);
    const checks = await repo.findMany("FluencyCheck", { studentId: st.studentId });
    assert.deepEqual(checks.map((c) => Number(c.wcpm)), before.checks.map((c) => Number(c.wcpm)));
    const home = await coachHome(repo, st, ENV, now);
    assert.deepEqual([home.latest, home.officialLevel, home.norm, home.progress, home.history.length], [before.home.latest, before.home.officialLevel, before.home.norm, before.home.progress, before.home.history.length]);
  });

  test("only the student's own reading can be read again; echo and drill cannot", async () => {
    const first = await scoreReading(repo, st, { key, mode: "PASSAGE", kind: "ECHO", sentence: 0, seconds: 4, audio: AUDIO, mime: "audio/wav" }, ENV, { scorer: fixed({ lastWordIndex: 4 }) });
    assert.ok(first.status === "OK");
    if (first.status !== "OK") return;
    await assert.rejects(scoreReading(repo, st, { key, mode: "PASSAGE", seconds: 30, audio: AUDIO, mime: "audio/wav", rereadOf: first.result.id }, ENV, { scorer: fixed({ lastWordIndex: 30 }) }), /cannot be read again/);
    const mine = (await repo.findMany("FluencyPractice", { studentId: st.studentId, practiceKind: "MINUTE" }))[0];
    await assert.rejects(scoreReading(repo, other, { key, mode: "PASSAGE", seconds: 30, audio: AUDIO, mime: "audio/wav", rereadOf: String(mine.id) }, ENV, { scorer: fixed({ lastWordIndex: 30 }) }), /not found/);
  });

  test("encouraging words for every outcome", () => {
    assert.match(improvementOf({ wcpm: 50, accuracy: 90 }, { wcpm: 51, accuracy: 90 }).message, /1 more word correct/);
    assert.match(improvementOf({ wcpm: 50, accuracy: 95 }, { wcpm: 60, accuracy: 90 }).message, /Faster/);
    assert.match(improvementOf({ wcpm: 50, accuracy: 90 }, { wcpm: 48, accuracy: 96 }).message, /More words right/);
    assert.match(improvementOf({ wcpm: 50, accuracy: 90 }, { wcpm: 50, accuracy: 90 }).message, /Steady/);
    assert.match(improvementOf({ wcpm: 50, accuracy: 90 }, { wcpm: 40, accuracy: 80 }).message, /Good effort/);
  });
});

describe("practice: a submit after the session ended is a friendly no-op", () => {
  let repo: SqliteRepo; let lina: Actor;
  before(async () => {
    ({ repo } = await demoDatabase());
    await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
    const g4 = (await repo.findMany("Question", { status: "UNDER_REVIEW" })).filter((q) => String(q.externalRef).startsWith("G4-"));
    await repo.updateMany("Question", { id: { in: g4.map((q) => q.id) } }, { status: "PUBLISHED" });
    lina = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.s1001" }))!);
  });

  test("two tabs / double clicks: the same result again, nothing saved twice, no score change", async () => {
    const st = (await repo.findUnique("Student", { id: lina.studentId! }))!;
    const cur = (await repo.findMany("Curriculum", { gradeId: st.gradeId }))[0];
    const sid = String((await repo.findUnique("Skill", { curriculumId: cur.id, code: "G4.theme" }))!.id);
    const T0 = new Date("2026-11-02T08:00:00Z");
    const view = await startPractice(repo, lina, sid, T0, seededRandom(7));
    const q = view.question!;
    const item = (await loadSkillItems(repo, sid)).find((i) => i.questionId === q.questionId)!;
    const right = rightAnswer(item);
    const r1 = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: q.questionId, response: right }, new Date(T0.getTime() + 180_000)); // r67: a reader's time (the first question of a passage under a third of its reading time is a rapid guess)
    // tab A leaves (the session ends); tab B still shows the answered question and submits it again
    await endPractice(repo, lina, view.sessionId, new Date(T0.getTime() + 190_000));
    const counts = async () => ({ attempts: await repo.count("QuestionAttempt", { sessionId: view.sessionId }), xp: await repo.count("XpEvent", { studentId: lina.studentId }), mastery: Number((await repo.findUnique("StudentSkillMastery", { studentId: lina.studentId, skillId: sid }))!.score) });
    const before = await counts();
    const dup = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: q.questionId, response: right }, new Date(T0.getTime() + 200_000));
    assert.equal(dup.feedback.alreadyEnded, true);
    assert.equal(r1.feedback.correct, true);
    assert.equal(dup.feedback.correct, r1.feedback.correct, "the same result as the first submit");
    assert.equal(dup.feedback.yourAnswer, r1.feedback.yourAnswer);
    assert.equal(dup.feedback.correctAnswer, r1.feedback.correctAnswer);
    assert.equal(dup.feedback.xp, 0);
    assert.equal(dup.feedback.masteryBefore, dup.feedback.masteryAfter);
    assert.equal(dup.feedback.next.hasQuestion, false);
    assert.equal(dup.view.ended, true);
    assert.deepEqual(await counts(), before, "no attempt, XP or mastery change");
    // a question that was never answered in the ended session: also a no-op (blank result)
    const next = (await loadSkillItems(repo, sid)).find((i) => i.questionId !== q.questionId)!;
    const dup2 = await submitAnswer(repo, lina, { sessionId: view.sessionId, questionId: next.questionId, response: "A" }, new Date(T0.getTime() + 210_000));
    assert.equal(dup2.feedback.alreadyEnded, true);
    assert.deepEqual(await counts(), before);
    assert.equal((await currentQuestion(repo, lina, view.sessionId)).ended, true);
    // the page shows the friendly card, and the button cannot send twice
    const player = readFileSync(join(ROOT, "src/components/practice/practice-player.tsx"), "utf8");
    assert.match(player, /Nice work! This practice is finished\./);
    assert.match(player, /New practice/); assert.match(player, /Back to My Work/);
    assert.match(player, /if \(sending\.current \|\| pending\) return;/);
    assert.doesNotMatch(readFileSync(join(ROOT, "src/server/practice/session.ts"), "utf8"), /This practice session has ended/);
  });
});

describe("pre-generation: small batches for the AI limit, slow recordings, resume", () => {
  test("Gemini runs at 4 requests a minute by default; --slow makes both speeds; --from resumes", async () => {
    const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    for (const t of ["One", "Two", "Three"]) await repo.create("ReadingPassage", { title: t, body: `${t} short text.`, wordCount: 3, sentenceCount: 1, avgSentenceLength: 3, avgWordLength: 4, status: "PUBLISHED" });
    const { f, calls } = fakeGemini({ ms: 100 });
    const slept: number[] = [];
    const r = await pregenerate(repo, GEM, { apply: true, fetchImpl: f, only: ["passages"], speeds: ["normal", "slow"], limit: 4, log: () => {}, sleep: async (ms) => { slept.push(ms); } });
    assert.equal(r.generated, 4);
    assert.equal(calls.length, 4);
    assert.ok(slept.some((ms) => ms > 10_000), "about 15 s between requests (4 a minute)");
    assert.equal(r.resume, "passages:0");
    assert.equal(calls.filter((c) => /slowly/.test(JSON.stringify(c.body.contents))).length, 2);
    const r2 = await pregenerate(repo, GEM, { apply: true, fetchImpl: f, only: ["passages"], speeds: ["normal", "slow"], rpm: 600, from: r.resume!, log: () => {}, sleep: async () => {} });
    assert.equal(r2.generated, 2);
    assert.equal(await repo.count("TtsAudio", {}), 6);
    assert.deepEqual(parseFrom("readrise:400"), { source: "readrise", skip: 400 });
    assert.equal(parseFrom("nope:1"), null);
    const cli = readFileSync(join(ROOT, "scripts/tts/pregenerate.ts"), "utf8");
    assert.match(cli, /--slow/); assert.match(cli, /from: arg\("from"\)/);
  });
});
