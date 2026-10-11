/**
 * Update 42C — a meaning for every word (FAKE test data only — the Test School): word forms → base words, irregular
 * forms, names, the AI fallback (fake fetch; word + sentence only), AI off → kind hint + missing-word request, the
 * bounded cache, school scoping, concurrent dedupe and the prefill script.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { seedTestEnvironment } from "../src/server/seeding/test-env";
import { setAiSettings } from "../src/server/ai/engine";
import { lookupWord, notebook, saveDefinition, type Fetcher } from "../src/server/student/words";
import { IRREGULAR, isProperNoun, lemmaCandidates, lemmaTiers, NAME_DEFINITION, NO_MEANING_HELP, normalizeWord } from "../src/server/vocabulary/lemma";
import { fillMissingWithAi, Lru, missingWords, wordCache, wordValidator, WORD_CACHE_MAX } from "../src/server/vocabulary/meaning";
import { prefill, wordsOf } from "../src/server/vocabulary/prefill";
import { demoDatabase } from "./helpers/db";

const ENV = { GEMINI_API_KEY: "AIzaFAKE-test-key" };
const notFound: Fetcher = async () => ({ ok: false, status: 404, json: async () => ({}) });

/** A fake Gemini: answers every requested word; records each request body. */
function fakeGemini(opts: { delayMs?: number; fail?: boolean } = {}) {
  const bodies: string[] = [];
  const f = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(String(init?.body ?? ""));
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail) return new Response("down", { status: 503 });
    const sent = JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text) as { words: { word: string; sentence: string }[] };
    const base = (w: string) => (w.endsWith("ed") ? w.slice(0, -2) : w);
    const results = sent.words.map((x) => ({ word: x.word, baseWord: base(x.word), partOfSpeech: "verb", definition: `To move in a fun, bouncy way.`, example: `The kids ${x.word} home.`, arabicGloss: "يقفز" }));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results }) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, bodies };
}

describe("Update 42C: a meaning for every word", () => {
  let repo: SqliteRepo; let admin: Actor; let teacher: Actor; let me: Actor; let otherAdmin: Actor;
  const now = new Date(Date.UTC(2026, 9, 14, 9));
  const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);

  before(async () => {
    ({ repo } = await demoDatabase());
    await seedTestEnvironment(repo, { root: process.cwd(), passwordHash: "x".repeat(60), practice: "none" });
    admin = await actorFor("test.admin");
    teacher = await actorFor("test.teacher.1");
    const st = (await repo.findMany("Student", {})).find((x) => x.schoolId === admin.schoolId)!;
    me = await resolveActor(repo, (await repo.findUnique("User", { id: st.userId }))!);
    const ou = (await repo.findMany("User", { role: "SCHOOL_ADMIN" })).find((u) => u.schoolId !== admin.schoolId)!;
    otherAdmin = await resolveActor(repo, ou);
  });

  test("normalize + lemmas: case, punctuation, curly quotes, possessives, plurals, -ed/-ing, doubled consonants, -ied, -er/-est, -ly", () => {
    assert.equal(normalizeWord("“Running,”"), "running");
    assert.equal(normalizeWord("Ahmed’s"), "ahmed");
    assert.equal(normalizeWord("girls’"), "girls");
    assert.equal(normalizeWord("Don’t!"), "don't");
    assert.equal(normalizeWord("two words"), null);
    const first = (w: string, base: string) => assert.ok(lemmaCandidates(w).includes(base), `${w} → ${base}: ${lemmaCandidates(w).join(",")}`);
    for (const [w, b] of [["stopped", "stop"], ["cried", "cry"], ["boxes", "box"], ["cities", "city"], ["knives", "knife"], ["wolves", "wolf"], ["makes", "make"], ["baked", "bake"], ["walked", "walk"], ["running", "run"], ["making", "make"], ["playing", "play"], ["bigger", "big"], ["happiest", "happy"], ["nicer", "nice"], ["quickly", "quick"], ["happily", "happy"], ["gently", "gentle"], ["houses", "house"], ["glasses", "glass"], ["don't", "do"], ["they're", "they"]]) first(w, b);
    assert.deepEqual(lemmaCandidates("stopped").slice(0, 2), ["stopped", "stop"], "the double consonant is undone first");
    assert.deepEqual(lemmaCandidates("baked").slice(0, 2), ["baked", "bake"]);
    assert.deepEqual(lemmaCandidates("visited").slice(0, 2), ["visited", "visit"]);
    // -er / -est / -ly bases are “risky”: teacher is not teach, early is not ear
    assert.ok(lemmaTiers("teacher").risky.includes("teach") && !lemmaTiers("teacher").safe.includes("teach"));
    assert.ok(!lemmaCandidates("evening").includes("even"), "evening is its own word");
    assert.ok(!lemmaCandidates("news").includes("new"));
  });

  test("irregular forms (≈300): went → go, ran → run, children → child, better → good, thought → think", () => {
    assert.ok(IRREGULAR.size >= 250, `irregular forms: ${IRREGULAR.size}`);
    for (const [w, b] of [["went", "go"], ["ran", "run"], ["children", "child"], ["better", "good"], ["thought", "think"], ["mice", "mouse"], ["taught", "teach"], ["written", "write"], ["feet", "foot"], ["worst", "bad"]]) assert.equal(lemmaCandidates(w)[1], b, w);
    assert.deepEqual(lemmaCandidates("children's").slice(0, 2), ["children", "child"]);
  });

  test("a form finds its base word with no network call; the meaning says which form was tapped", async () => {
    await saveDefinition(repo, teacher, "stop", { partOfSpeech: "verb", definition: "To not move any more." });
    await saveDefinition(repo, teacher, "child", { partOfSpeech: "noun", definition: "A young boy or girl." });
    let calls = 0; const counting: Fetcher = async (u) => { calls++; return notFound(u); };
    const v = await lookupWord(repo, me, "Stopped,", now, counting);
    assert.equal(v.word, "stop"); assert.equal(v.formOf, "stopped"); assert.equal(v.meanings[0].definition, "To not move any more.");
    const c = await lookupWord(repo, me, "children’s", now, counting);
    assert.equal(c.word, "child");
    assert.equal(calls, 0, "found in the school dictionary");
    assert.ok((await notebook(repo, me)).some((w) => w.word === "stop"), "the notebook keeps the base word");
  });

  test("names: capitalized in the middle of a sentence → a name of a person or place (not saved, not in the notebook)", async () => {
    assert.equal(isProperNoun("Ahmed", "Yesterday Ahmed visited Dubai."), true);
    assert.equal(isProperNoun("Dubai.", "Yesterday Ahmed visited Dubai."), true);
    assert.equal(isProperNoun("Yesterday", "Yesterday Ahmed visited Dubai."), false, "the first word of a sentence");
    assert.equal(isProperNoun("Sara", "“Come here,” said Sara."), true);
    assert.equal(isProperNoun("May", "In May we swim."), false, "months are dictionary words");
    let calls = 0; const counting: Fetcher = async (u) => { calls++; return notFound(u); };
    const v = await lookupWord(repo, me, "Ahmed", now, counting, { sentence: "Yesterday Ahmed visited Dubai." });
    assert.equal(v.source, "NAME"); assert.equal(v.meanings[0].definition, NAME_DEFINITION);
    assert.equal(calls, 0);
    assert.equal(await repo.findUnique("WordEntry", { schoolId: me.schoolId, word: "ahmed" }), null);
    assert.ok(!(await notebook(repo, me)).some((w) => w.word === "ahmed"));
  });

  test("AI fallback (fake fetch): word + sentence only, saved once for the school as AI, no student identifiers sent", async () => {
    const g = fakeGemini();
    const v = await lookupWord(repo, me, "zorbled", now, notFound, { sentence: "The robot zorbled across the floor.", env: ENV, aiFetch: g.f });
    assert.equal(v.source, "AI"); assert.equal(v.word, "zorbl"); assert.equal(v.formOf, "zorbled");
    assert.equal(v.meanings[0].definition, "To move in a fun, bouncy way.");
    assert.equal(g.bodies.length, 1);
    const sent = JSON.parse(JSON.parse(g.bodies[0]).contents[0].parts[0].text);
    assert.deepEqual(sent.words, [{ word: "zorbled", sentence: "The robot zorbled across the floor." }]);
    const user = (await repo.findUnique("User", { id: me.userId }))!;
    for (const id of [me.userId, me.studentId!, String(user.username), String(user.displayName)]) assert.ok(!g.bodies[0].includes(id), `the AI request must not contain ${id}`);
    const row = (await repo.findUnique("WordEntry", { schoolId: me.schoolId, word: "zorbl" }))!;
    assert.equal(row.source, "AI"); assert.equal(row.arabicGloss, "يقفز");
    // generated once: the next tap (any student) uses the saved meaning
    const again = await lookupWord(repo, me, "zorbling", now, notFound, { env: ENV, aiFetch: g.f });
    assert.equal(again.source, "AI"); assert.equal(g.bodies.length, 1);
    // a teacher sees it marked for checking
    assert.ok(wordValidator(["x"])({ results: [{ word: "x", baseWord: "x", partOfSpeech: "noun", definition: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen" }] }).ok === false, "definitions are 15 words or fewer");
  });

  test("school scoping: another school does not see this school's words", async () => {
    const g = fakeGemini();
    await setAiSettings(repo, otherAdmin, { provider: "off" });
    const v = await lookupWord(repo, otherAdmin, "zorbled", now, notFound, { env: ENV, aiFetch: g.f });
    assert.equal(v.meanings.length, 0);
    assert.equal(g.bodies.length, 0, "AI off for that school");
    assert.equal(await repo.findUnique("WordEntry", { schoolId: otherAdmin.schoolId, word: "zorbl" }), null);
    await assert.rejects(missingWords(repo, me), ForbiddenError);
    assert.ok(!(await missingWords(repo, admin)).some((m) => m.word === "zorbled"));
  });

  test("AI off → kind hint + one deduplicated missing-word request (count, last sentence); admin “Add meanings with AI”", async () => {
    await setAiSettings(repo, admin, { provider: "off" });
    const g = fakeGemini();
    const a = await lookupWord(repo, me, "flimbered", now, notFound, { sentence: "The kite flimbered in the wind.", env: ENV, aiFetch: g.f });
    assert.equal(a.meanings.length, 0); assert.equal(a.help, NO_MEANING_HELP);
    await lookupWord(repo, me, "flimbered", now, notFound, { sentence: "Leaves flimbered down.", env: ENV, aiFetch: g.f });
    assert.equal(g.bodies.length, 0);
    const rows = await repo.findMany("MissingWord", { schoolId: me.schoolId, word: "flimbered" });
    assert.equal(rows.length, 1); assert.equal(Number(rows[0].count), 2); assert.equal(rows[0].lastSentence, "Leaves flimbered down.");
    assert.ok(!Object.keys(rows[0]).some((k) => /student|user/i.test(k)), "no student data in the request");
    const list = await missingWords(repo, teacher);
    assert.equal(list[0].word, "flimbered");
    await assert.rejects(fillMissingWithAi(repo, teacher, ENV, { fetchImpl: g.f }), ForbiddenError);
    const off = await fillMissingWithAi(repo, admin, ENV, { fetchImpl: g.f });
    assert.equal(off.added, 0); assert.match(off.message, /switched off/);
    await setAiSettings(repo, admin, { provider: "auto", perMinute: 10 });
    const on = await fillMissingWithAi(repo, admin, ENV, { fetchImpl: g.f });
    assert.equal(on.added, 1); assert.equal(on.left, 0);
    assert.equal(g.bodies.length, 1);
    const v = await lookupWord(repo, me, "flimbered", now, notFound);
    assert.equal(v.word, "flimber"); assert.equal(v.source, "AI");
  });

  test("AI down or slow → the kind hint (within the time budget)", async () => {
    const down = fakeGemini({ fail: true });
    const a = await lookupWord(repo, me, "gribbled", now, notFound, { env: ENV, aiFetch: down.f });
    assert.equal(a.help, NO_MEANING_HELP);
    const slow = fakeGemini({ delayMs: 400 });
    const t0 = Date.now();
    const b = await lookupWord(repo, me, "quompled", now, notFound, { env: ENV, aiFetch: slow.f, aiTimeoutMs: 100 });
    assert.equal(b.help, NO_MEANING_HELP); assert.ok(Date.now() - t0 < 2000);
    await new Promise((r) => setTimeout(r, 600));
    assert.ok(await repo.findUnique("WordEntry", { schoolId: me.schoolId, word: "quompl" }), "a late reply is still saved for the next tap");
  });

  test("concurrent taps of one word: one lookup, one AI request", async () => {
    await setAiSettings(repo, admin, { provider: "auto", perMinute: 30 });
    const g = fakeGemini({ delayMs: 50 });
    const [x, y, z] = await Promise.all([1, 2, 3].map(() => lookupWord(repo, me, "snarfled", now, notFound, { env: ENV, aiFetch: g.f })));
    assert.equal(g.bodies.length, 1);
    assert.ok([x, y, z].every((v) => v.source === "AI" && v.word === "snarfl"));
  });

  test("cache: bounded LRU; a cached word needs no query; a teacher's change is seen at once", async () => {
    const l = new Lru<number>(3);
    l.set("a", 1); l.set("b", 2); l.set("c", 3); l.get("a"); l.set("d", 4);
    assert.equal(l.size, 3); assert.equal(l.get("b"), undefined, "least recently used dropped"); assert.equal(l.get("a"), 1);
    assert.equal(WORD_CACHE_MAX, 5000);
    await lookupWord(repo, me, "stop", now, notFound);
    let finds = 0;
    const spy = new Proxy(repo, { get(t, p, r) { const v = Reflect.get(t, p, r); if (p === "findMany") return (...a: unknown[]) => { if (a[0] === "WordEntry") finds++; return (v as (...x: unknown[]) => unknown).apply(t, a); }; return typeof v === "function" ? v.bind(t) : v; } });
    // the spy is its own cache owner: first lookup = 1 query, second = cache
    await lookupWord(spy, me, "stopped", now, notFound); await lookupWord(spy, me, "stopped", now, notFound);
    assert.equal(finds, 1);
    assert.ok(wordCache(repo).size <= WORD_CACHE_MAX);
    await saveDefinition(repo, teacher, "stop", { partOfSpeech: "verb", definition: "To end moving." });
    assert.equal((await lookupWord(repo, me, "stopped", now, notFound)).meanings[0].definition, "To end moving.");
  });

  test("prefill script: scans passages, skips names and known words, dry run by default, --apply writes in batches", async () => {
    const m = new Map<string, string>();
    wordsOf("Yesterday Ahmed blorped the <b>gate</b>. Then Ahmed stopped.", m);
    assert.ok(m.has("blorped") && m.has("gate") && m.has("stopped") && !m.has("ahmed"));
    const n = new Map<string, string>(); wordsOf("Omar ran home. Later Omar slept.", n);
    assert.ok(!n.has("omar"), "a name seen mid-sentence anywhere is skipped everywhere");
    await repo.create("ReadingPassage", { title: "Test passage", body: "The cat wuzzled the yarn. The dog wuzzled too, and the cat stopped.", wordCount: 13, sentenceCount: 2, avgSentenceLength: 6.5, avgWordLength: 4, status: "PUBLISHED", origin: "TEACHER_AUTHORED", updatedAt: now });
    const logs: string[] = [];
    const dry = await prefill(repo, ENV, { apply: false, school: admin.schoolId!, limit: 50, log: (x) => logs.push(x) });
    assert.ok(dry[0].missing >= 1); assert.equal(dry[0].added, 0);
    assert.equal(await repo.findUnique("WordEntry", { schoolId: admin.schoolId, word: "wuzzl" }), null, "dry run writes nothing");
    const g = fakeGemini();
    const run = await prefill(repo, ENV, { apply: true, school: admin.schoolId!, limit: 5000, log: () => undefined, wait: async () => undefined, fetchImpl: g.f });
    assert.ok(run[0].added >= 1);
    const asked = g.bodies.flatMap((b) => (JSON.parse(JSON.parse(b).contents[0].parts[0].text).words as { word: string }[]).map((w) => w.word));
    assert.ok(asked.includes("wuzzled") || run[0].added < dry[0].missing, "the passage's new word is asked (unless the AI limits stopped the run)");
    const base = asked[0].endsWith("ed") ? asked[0].slice(0, -2) : asked[0];
    assert.equal((await repo.findUnique("WordEntry", { schoolId: admin.schoolId, word: base }))!.source, "AI");
    assert.ok(!asked.includes("stopped"), "known words (stop) are not asked again");
    assert.ok(g.bodies.every((b) => (JSON.parse(JSON.parse(b).contents[0].parts[0].text).words as unknown[]).length <= 30));
  });
});
