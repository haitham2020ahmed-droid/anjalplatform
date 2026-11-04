/**
 * UI reorg Phase 6 — natural read-aloud: provider selection, Google / Gemini providers with a fake fetch, word
 * timings, the browser-voice fallback, no student data sent to a provider, the pre-generation script (dry run,
 * apply, resumable) and the audio route helpers.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { demoDatabase } from "./helpers/db";
import { chunkWords, estimateWordTimes, normalizeSpeech, passageSpeech, questionSpeech, speechKey, speechWords, wordAt, wordAtChar } from "../src/lib/tts/text";
import { AUDIO_RATE, pickBestVoice, rankVoices, scoreVoice, SPEECH_RATE } from "../src/lib/tts/voices";
import { mp3DurationMs, parseWav, wavFile, resample, joinMp3 } from "../src/server/tts/audio";
import { geminiProvider, googleProvider, googleVoiceHasMarks, pickTtsProvider, ssmlWithMarks, TtsError, type FetchLike, type TtsProvider } from "../src/server/tts/providers";
import { estimateCost, pregenerate } from "../src/server/tts/pregenerate";
import { existingVoices, findAudioMeta, parseRange, readAudio } from "../src/server/tts/store";

const ROOT = join(__dirname, "..");

/** n MPEG-2 layer III frames, 32 kbit/s, 24 kHz: 96 bytes and 24 ms each. */
function mp3Frames(n: number): Uint8Array {
  const f = new Uint8Array(96); f[0] = 0xff; f[1] = 0xf3; f[2] = 0x44; f[3] = 0xc4;
  const out = new Uint8Array(96 * n);
  for (let i = 0; i < n; i++) out.set(f, i * 96);
  return out;
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> }
function fakeFetch(answer: (body: Record<string, unknown>, url: string) => { status?: number; json?: unknown }): { f: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, headers: init.headers, body });
    const a = answer(body, url);
    const status = a.status ?? 200;
    return { ok: status < 400, status, json: async () => a.json, text: async () => JSON.stringify(a.json ?? {}) };
  };
  return { f, calls };
}

/** Google answer: 10 frames (240 ms) per request and a timepoint for every <mark>, 100 ms apart. */
const googleAnswer = (body: Record<string, unknown>) => {
  const input = body.input as { ssml?: string; text?: string };
  const marks = [...(input.ssml ?? "").matchAll(/<mark name="(\d+)"\/>/g)].map((m) => m[1]);
  return { json: { audioContent: b64(mp3Frames(10)), timepoints: marks.map((m, k) => ({ markName: m, timeSeconds: k * 0.1 })) } };
};

describe("Phase 6 · read-aloud text, keys and timings", () => {
  test("the spoken text is the same in the browser and in the script (same hash)", async () => {
    const opts = [{ label: "A", text: "a kite" }, { label: "B", text: "a fig tree" }];
    const ui = [" What  is ____ here?", ...opts.map((o) => `${o.label}. ${o.text}`)].join(". ");
    assert.equal(questionSpeech(" What  is ____ here?", opts), normalizeSpeech(ui));
    assert.equal(normalizeSpeech("The ____ ran."), "The blank ran.");
    assert.equal(passageSpeech("Title", "## Heading\nText → more"), "Title. Heading Text, then more");
    const k1 = await speechKey(ui), k2 = await speechKey(questionSpeech(" What  is ____ here?", opts));
    assert.match(String(k1), /^[0-9a-f]{64}$/);
    assert.equal(k1, k2);
    assert.notEqual(k1, await speechKey("something else"));
  });

  test("words, chunks of whole sentences, estimated and looked-up timings", () => {
    const text = "One two three. Four five six seven. Eight nine, ten.";
    const w = speechWords(text);
    assert.equal(w.length, 10);
    assert.deepEqual(w[3], { text: "Four", start: 15, end: 19 });
    const ch = chunkWords(w, 25);
    assert.deepEqual(ch, [[0, 3], [3, 7], [7, 10]]);
    // a sentence longer than the limit is split between words; every word in exactly one chunk
    const long = speechWords("a ".repeat(50).trim() + ".");
    const lc = chunkWords(long, 20);
    assert.equal(lc[0][0], 0); assert.equal(lc.at(-1)![1], 50);
    for (let i = 1; i < lc.length; i++) assert.equal(lc[i][0], lc[i - 1][1]);
    const t = estimateWordTimes(w, 5000, 1000);
    assert.equal(t.length, 10); assert.equal(t[0], 1000);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
    assert.ok(t[3] - t[2] > t[2] - t[1], "a pause after a full stop");
    assert.ok(t[9] < 6000);
    assert.equal(wordAt(t, 0), -1); assert.equal(wordAt(t, t[4]), 4); assert.equal(wordAt(t, 999999), 9);
    assert.equal(wordAtChar(w, 16), 3); assert.equal(wordAtChar(w, 0), 0);
  });
});

describe("Phase 6 · providers", () => {
  test("provider selection by TTS_PROVIDER (keys from the env helper)", () => {
    assert.equal(pickTtsProvider({}).ok, false);
    assert.equal(pickTtsProvider({ TTS_PROVIDER: "browser" }).ok, false);
    const noKey = pickTtsProvider({ TTS_PROVIDER: "google" });
    assert.ok(!noKey.ok && /GOOGLE_TTS_API_KEY/.test(noKey.reason));
    const g = pickTtsProvider({ TTS_PROVIDER: "Google", GOOGLE_TTS_API_KEY: "k" });
    assert.ok(g.ok && g.provider.id === "google" && g.provider.voice === "en-US-Chirp3-HD-Leda");
    const gm = pickTtsProvider({ TTS_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_TTS_VOICE: "Sulafat" });
    assert.ok(gm.ok && gm.provider.id === "gemini" && gm.provider.voice === "gemini-2.5-flash-preview-tts:Sulafat:t3");
    assert.ok(!pickTtsProvider({ TTS_PROVIDER: "gemini" }).ok);
    assert.ok(!pickTtsProvider({ TTS_PROVIDER: "polly", GEMINI_API_KEY: "k" }).ok);
    // the env helper names every variable explicitly (no process.env passed around)
    const env = readFileSync(join(ROOT, "src/server/tts/env.ts"), "utf8");
    for (const k of ["TTS_PROVIDER", "GOOGLE_TTS_API_KEY", "GOOGLE_TTS_VOICE", "GEMINI_TTS_MODEL", "GEMINI_TTS_VOICE"]) assert.ok(env.includes(`${k}: process.env.${k}`), k);
    assert.ok(env.includes("GEMINI_API_KEY: aiEnv().GEMINI_API_KEY"), "the Gemini key comes from aiEnv()");
  });

  test("Google: SSML marks → exact word timings across chunks; MP3 joined; key in a header", async () => {
    const { f, calls } = fakeFetch(googleAnswer);
    const p = googleProvider({ GOOGLE_TTS_API_KEY: "secret-key", GOOGLE_TTS_VOICE: "en-US-Neural2-F", TTS_SPEAKING_RATE: "0.9" }, { fetchImpl: f });
    const sentence = "The kite flew over the old fig tree & the wall. ";
    const text = normalizeSpeech(sentence.repeat(40)); // > 1200 characters: several requests
    const r = await p.synthesize(text);
    assert.ok(calls.length >= 2);
    const c = calls[0];
    assert.equal(c.url, "https://texttospeech.googleapis.com/v1beta1/text:synthesize");
    assert.equal(c.headers["x-goog-api-key"], "secret-key");
    assert.ok(!c.url.includes("secret-key"));
    assert.deepEqual(c.body.enableTimePointing, ["SSML_MARK"]);
    assert.deepEqual(c.body.voice, { languageCode: "en-US", name: "en-US-Neural2-F" });
    assert.deepEqual(c.body.audioConfig, { audioEncoding: "MP3", speakingRate: 0.9 });
    const ssml = String((c.body.input as { ssml: string }).ssml);
    assert.ok(ssml.startsWith('<speak><mark name="0"/>The <mark name="1"/>kite'));
    assert.ok(ssml.includes("&amp;"));
    assert.equal(r.mime, "audio/mpeg");
    assert.equal(r.requests, calls.length);
    assert.equal(r.durationMs, 240 * calls.length);
    assert.equal(r.audio.length, 960 * calls.length);
    assert.equal(r.timings.exact, true);
    const words = speechWords(text);
    assert.equal(r.timings.words.length, words.length);
    assert.equal(r.timings.words[1], 100);
    // the second request's words start after the first request's audio
    const firstChunk = (String((calls[0].body.input as { ssml: string }).ssml).match(/<mark /g) ?? []).length;
    assert.equal(r.timings.words[firstChunk], 240);
    assert.ok(r.billedChars <= text.replace(/&/g, "&amp;").length + 16 * calls.length, "marks are not billed (only the text, its escaping and <speak>)");
  });

  test("Google Chirp 3 HD voice: plain text, estimated timings", async () => {
    assert.equal(googleVoiceHasMarks("en-US-Chirp3-HD-Aoede"), false);
    assert.equal(googleVoiceHasMarks("en-US-Neural2-F"), true);
    const { f, calls } = fakeFetch(googleAnswer);
    const r = await googleProvider({ GOOGLE_TTS_API_KEY: "k" }, { fetchImpl: f }).synthesize("Read this short sentence.");
    assert.equal(calls.length, 1);
    assert.equal((calls[0].body.voice as { name: string }).name, "en-US-Chirp3-HD-Leda");
    assert.deepEqual(calls[0].body.input, { text: "Read this short sentence." });
    assert.equal(calls[0].body.enableTimePointing, undefined);
    assert.equal(r.timings.exact, false);
    assert.equal(r.timings.words.length, 4);
    assert.equal(r.timings.words[0], 0);
  });

  test("Google errors: rate limit is retryable, a bad key is not", async () => {
    const busy = googleProvider({ GOOGLE_TTS_API_KEY: "k" }, { fetchImpl: fakeFetch(() => ({ status: 429, json: { error: "quota" } })).f });
    await assert.rejects(busy.synthesize("Hi."), (e: unknown) => e instanceof TtsError && e.retry);
    const bad = googleProvider({ GOOGLE_TTS_API_KEY: "k" }, { fetchImpl: fakeFetch(() => ({ status: 403, json: { error: "API key not valid" } })).f });
    await assert.rejects(bad.synthesize("Hi."), (e: unknown) => e instanceof TtsError && !e.retry && /403/.test(e.message));
  });

  test("Gemini: PCM 24 kHz → 16 kHz WAV, estimated timings, school key in a header", async () => {
    const pcm = new Uint8Array(24_000 * 2); // one second of silence, 16-bit
    const { f, calls } = fakeFetch(() => ({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: b64(pcm) } }] } }] } }));
    const r = await geminiProvider({ GEMINI_API_KEY: "gem-key", GEMINI_TTS_VOICE: "Kore" }, { fetchImpl: f }).synthesize("A short text to read.");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent");
    assert.equal(calls[0].headers["x-goog-api-key"], "gem-key");
    const gc = calls[0].body.generationConfig as Record<string, unknown>;
    assert.deepEqual(gc.responseModalities, ["AUDIO"]);
    assert.deepEqual(gc.speechConfig, { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } });
    assert.match(JSON.stringify(calls[0].body.contents), /American English/);
    assert.equal(r.mime, "audio/wav");
    assert.equal(r.durationMs, 1000);
    const wav = parseWav(r.audio)!;
    assert.equal(wav.rate, 16_000); assert.equal(wav.samples.length, 16_000);
    assert.equal(r.timings.exact, false);
    assert.equal(r.timings.words.length, 5);
    // a WAV answer is read too; an empty style sends the text alone
    const w = fakeFetch(() => ({ json: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: b64(wavFile(new Int16Array(8000), 16_000)) } }] } }] } }));
    const r2 = await geminiProvider({ GEMINI_API_KEY: "k", GEMINI_TTS_STYLE: "" }, { fetchImpl: w.f }).synthesize("Hello there.");
    assert.equal(r2.durationMs, 500);
    assert.deepEqual(w.calls[0].body.contents, [{ parts: [{ text: "Hello there." }] }]);
    await assert.rejects(geminiProvider({ GEMINI_API_KEY: "k" }, { fetchImpl: fakeFetch(() => ({ json: { candidates: [] } })).f }).synthesize("x"), TtsError);
  });

  test("audio helpers: MP3 length, WAV round trip, resampling, joining", () => {
    assert.equal(mp3DurationMs(mp3Frames(50)), 1200);
    const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10, ...new Array(10).fill(0)]);
    assert.equal(mp3DurationMs(new Uint8Array([...id3, ...mp3Frames(5)])), 120);
    assert.equal(joinMp3([mp3Frames(2), new Uint8Array([...id3, ...mp3Frames(3)])]).length, 96 * 5);
    const s = new Int16Array([0, 100, 200, 300, 400, 500]);
    assert.deepEqual([...parseWav(wavFile(s, 8000))!.samples], [...s]);
    assert.equal(resample(new Int16Array(300), 24_000, 16_000).length, 200);
  });
});

describe("Phase 6 · browser-voice fallback", () => {
  test("the most natural US English voice is chosen; novelty voices never", () => {
    const voices = [
      { name: "Zarvox", lang: "en-US" },
      { name: "Microsoft David - English (United States)", lang: "en-US" },
      { name: "Daniel", lang: "en-GB" },
      { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Google US English", lang: "en-US" },
      { name: "Samantha", lang: "en-US" },
      { name: "Thomas", lang: "fr-FR" },
    ];
    assert.equal(pickBestVoice(voices)!.name, "Microsoft Aria Online (Natural) - English (United States)");
    assert.equal(pickBestVoice(voices.filter((v) => !/Aria/.test(v.name)))!.name, "Google US English");
    assert.equal(pickBestVoice([{ name: "Samantha", lang: "en-US" }, { name: "Ava (Premium)", lang: "en-US" }, { name: "Fred", lang: "en-US" }])!.name, "Ava (Premium)");
    assert.equal(pickBestVoice(voices, "Samantha")!.name, "Samantha", "the student's own choice is kept");
    assert.equal(pickBestVoice(voices, "Zarvox")!.name, "Microsoft Aria Online (Natural) - English (United States)");
    assert.equal(scoreVoice({ name: "Thomas", lang: "fr-FR" }), -1);
    assert.ok(!rankVoices(voices).some((v) => v.name === "Zarvox" || v.lang === "fr-FR"));
    assert.equal(pickBestVoice([{ name: "Thomas", lang: "fr-FR" }]), null);
    assert.ok(SPEECH_RATE.slow < SPEECH_RATE.normal && AUDIO_RATE.slow < AUDIO_RATE.normal);
  });

  test("the player: one shared component, Slow/Normal, 44 px buttons, highlighting, falls back to the device voice", () => {
    const src = readFileSync(join(ROOT, "src/components/listen-button.tsx"), "utf8");
    assert.match(src, /\/api\/tts\/\$\{key\}\?meta=1/);
    assert.match(src, /startSpeech\(0\)/); // no pre-generated audio, or it failed → device voice
    assert.match(src, /"Slow"/); assert.match(src, /"Normal"/);
    assert.match(src, /min-h-\[44px\]/);
    assert.match(src, /onboundary/); assert.match(src, /wordAt\(starts, a\.currentTime \* 1000\)/);
    assert.match(src, /Follow along/);
    assert.doesNotMatch(src, /Lexile/);
    // ReadMaster: Slow first for students reading below level
    assert.match(readFileSync(join(ROOT, "src/app/student/readmaster/[articleId]/page.tsx"), "utf8"), /slowFirst=\{a\.level === "BELOW"\}/);
    // the fluency coach recording is untouched by the player
    assert.doesNotMatch(readFileSync(join(ROOT, "src/components/fluency/recorder.ts"), "utf8"), /lib\/tts/);
  });

  test("audio route: sign-in required, Range support, cache headers", () => {
    const route = readFileSync(join(ROOT, "src/app/api/tts/[key]/route.ts"), "utf8");
    assert.match(route, /await apiActor\(\)/);
    assert.match(route, /status: 401/);
    assert.match(route, /Cache-Control/);
    assert.match(route, /status: 206/);
    assert.deepEqual(parseRange(null, 100), null);
    assert.deepEqual(parseRange("bytes=0-1", 100), { start: 0, end: 1 });
    assert.deepEqual(parseRange("bytes=10-", 100), { start: 10, end: 99 });
    assert.deepEqual(parseRange("bytes=-20", 100), { start: 80, end: 99 });
    assert.deepEqual(parseRange("bytes=0-500", 100), { start: 0, end: 99 });
    assert.equal(parseRange("bytes=200-300", 100), "bad");
  });
});

describe("Phase 6 · pre-generation script", () => {
  let repo: SqliteRepo;
  let studentWords: string[] = [];
  before(async () => {
    ({ repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 }));
    const school = (await repo.findMany("School", {}, { take: 1 }))[0];
    await repo.create("ReadingPassage", { title: "The Kite Repair", body: "Omar's kite lay on the grass.\n\nHis grandmother helped him fix it.", wordCount: 12, sentenceCount: 2, avgSentenceLength: 6, avgWordLength: 4, status: "PUBLISHED" });
    await repo.create("ReadingPassage", { title: "Draft text", body: "Not yet.", wordCount: 2, sentenceCount: 1, avgSentenceLength: 2, avgWordLength: 3, status: "DRAFT" });
    const art = await repo.create("ReadMasterArticle", { schoolId: school.id, code: "T-1", title: "Solar Power", gradeLevel: 4, status: "PUBLISHED" });
    await repo.create("ReadMasterVersion", { articleId: art.id, level: "BELOW", lexile: 500, body: "The sun gives us light.", wordCount: 5 });
    await repo.create("ReadMasterVersion", { articleId: art.id, level: "ON", lexile: 700, body: "The sun provides energy that panels collect.", wordCount: 7 });
    const users = await repo.findMany("User", { role: "STUDENT" }, { select: ["displayName", "username"] });
    studentWords = users.flatMap((u) => [String(u.displayName), String(u.username)]).filter((x) => x.length > 3);
    assert.ok(studentWords.length > 0);
  });

  test("dry run (default): counts and cost estimate, nothing generated, no provider called", async () => {
    const logs: string[] = [];
    const { f, calls } = fakeFetch(googleAnswer);
    const r = await pregenerate(repo, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k" }, { fetchImpl: f, log: (s) => logs.push(s) });
    assert.equal(r.apply, false);
    assert.equal(calls.length, 0);
    assert.equal(await repo.count("TtsAudio", {}), 0);
    const questions = await repo.count("Question", { status: "PUBLISHED" });
    assert.equal(r.texts, 1 + questions + 2, "1 published passage + published questions + 2 ReadMaster versions");
    assert.equal(r.missing, r.texts);
    assert.ok(r.chars > 100);
    assert.match(logs.join("\n"), /dry run: nothing was generated/);
    assert.equal(r.estimate["google-neural2"], "$0.00", "inside the free million characters");
    assert.deepEqual(estimateCost(3_000_000), { "google-neural2": "$32.00", "google-chirp3-hd": "$60.00", "gemini-flash-tts": "$51.00" });
    // without a provider the dry run still works and says what to set
    const r2 = await pregenerate(repo, {}, { log: () => {} });
    assert.equal(r2.provider, null); assert.equal(r2.texts, r.texts);
  });

  test("apply: audio + timings stored, only texts sent (no student data), rate limited, resumable", async () => {
    const { f, calls } = fakeFetch(googleAnswer);
    const slept: number[] = [];
    const r = await pregenerate(repo, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k", GOOGLE_TTS_VOICE: "en-US-Neural2-F" }, { apply: true, fetchImpl: f, limit: 5, rpm: 600, log: () => {}, sleep: async (ms) => { slept.push(ms); } });
    assert.equal(r.generated, 5);
    assert.equal(await repo.count("TtsAudio", {}), 5);
    const payload = JSON.stringify(calls.map((c) => c.body));
    for (const w of studentWords) assert.ok(!payload.includes(w), `student data sent: ${w}`);
    assert.doesNotMatch(payload, /DEMO-\d+|studentId|userId/);
    // the stored row is found by the hash of the text the page speaks
    const key = (await speechKey(passageSpeech("The Kite Repair", "Omar's kite lay on the grass.\n\nHis grandmother helped him fix it.")))!;
    const meta = await findAudioMeta(repo, key);
    assert.ok(meta);
    assert.equal(meta!.mime, "audio/mpeg");
    assert.equal(meta!.timings.exact, true);
    assert.equal(meta!.timings.words.length, speechWords(passageSpeech("The Kite Repair", "Omar's kite lay on the grass.\n\nHis grandmother helped him fix it.")).length);
    assert.equal((await readAudio(repo, key))!.bytes.length, 960);
    assert.equal(await findAudioMeta(repo, "0".repeat(64)), null, "no audio → the player uses the device voice");
    assert.equal(await findAudioMeta(repo, "../etc"), null);
    // resumable: the next run continues with what is missing
    const total = r.texts;
    const r2 = await pregenerate(repo, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k", GOOGLE_TTS_VOICE: "en-US-Neural2-F" }, { apply: true, fetchImpl: f, limit: 1000, rpm: 600, log: () => {}, sleep: async () => {} });
    assert.equal(r2.done, 5);
    assert.equal(r2.generated, total - 5);
    assert.equal(await repo.count("TtsAudio", {}), total);
    const r3 = await pregenerate(repo, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k", GOOGLE_TTS_VOICE: "en-US-Neural2-F" }, { apply: true, fetchImpl: f, rpm: 600, log: () => {}, sleep: async () => {} });
    assert.equal(r3.generated, 0); assert.equal(r3.done, total);
    // a new voice: kept unless --replace-voice
    const voices = await existingVoices(repo, [key]);
    assert.equal(voices.get(key), "en-US-Neural2-F");
    const other: TtsProvider = { id: "google", voice: "en-US-Chirp3-HD-Aoede", synthesize: async () => ({ audio: mp3Frames(1), mime: "audio/mpeg", durationMs: 24, timings: { v: 1, exact: false, words: [0] }, requests: 1, billedChars: 1 }) };
    const r4 = await pregenerate(repo, {}, { apply: true, provider: other, only: ["passages"], replaceVoice: true, log: () => {}, sleep: async () => {} });
    assert.equal(r4.generated, 1);
    assert.equal((await existingVoices(repo, [key])).get(key), "en-US-Chirp3-HD-Aoede");
    assert.equal(await repo.count("TtsAudio", {}), total, "replaced, not added");
  });

  test("apply: a bad key stops the run; a busy provider is retried after a wait", async () => {
    const { repo: r0 } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 1 });
    const bad = fakeFetch(() => ({ status: 403, json: { error: { message: "API key not valid" } } }));
    const s1 = await pregenerate(r0, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k" }, { apply: true, fetchImpl: bad.f, log: () => {}, sleep: async () => {} });
    assert.ok(s1.stopped && /403/.test(s1.stopped));
    assert.equal(bad.calls.length, 1, "stops at the first refusal");
    let n = 0;
    const flaky = fakeFetch((b) => (n++ === 0 ? { status: 503, json: {} } : googleAnswer(b)));
    const waits: number[] = [];
    const s2 = await pregenerate(r0, { TTS_PROVIDER: "google", GOOGLE_TTS_API_KEY: "k" }, { apply: true, limit: 1, fetchImpl: flaky.f, log: () => {}, sleep: async (ms) => { waits.push(ms); } });
    assert.equal(s2.generated, 1);
    assert.ok(waits.includes(60_000));
    // apply without a provider: nothing generated, the reason is given
    const s3 = await pregenerate(r0, { TTS_PROVIDER: "google" }, { apply: true, log: () => {} });
    assert.ok(s3.stopped && /GOOGLE_TTS_API_KEY/.test(s3.stopped));
    assert.equal(s3.generated, 0);
  });

  test("the script is a dry run unless --apply", () => {
    const s = readFileSync(join(ROOT, "scripts/tts/pregenerate.ts"), "utf8");
    assert.match(s, /apply: process\.argv\.includes\("--apply"\)/);
    assert.match(s, /ttsEnv\(\)/);
    assert.doesNotMatch(s, /process\.env/);
  });
});
