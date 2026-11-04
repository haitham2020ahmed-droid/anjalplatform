/**
 * 🎯 The answer-length clue (src/lib/length-cue.ts), "Update answer choices from files" (src/server/admin/option-rewrites.ts),
 * the Answer-length check figures (src/server/admin/answer-length.ts) and the teacher signal "Picks the longest answer"
 * (src/server/skills/longest-pick.ts).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { lengthCue, lengthCueOf } from "../src/lib/length-cue";
import { applyChunk, planQuestion, readManifest, rewriteChunk, rewriteStatus, useRewriteDir, type RewriteChunk, type RewriteCursor } from "../src/server/admin/option-rewrites";
import { answerLengthReport, flaggedDetails } from "../src/server/admin/answer-length";
import { longestOf, longestPickers, longestPickOf } from "../src/server/skills/longest-pick";
import { validateGenerated } from "../src/server/admin/ai-bank";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("🎯 lengthCue (pure)", () => {
  test("flags sentence-like choices whose correct one is the unique longest and > 1.15 × the next", () => {
    const opts = ["The boy ran home.", "The girl sat down.", "The boy ran home quickly because it was getting dark outside.", "The dog barked."];
    const c = lengthCue(opts, 2);
    assert.equal(c.flagged, true);
    assert.equal(c.longest, true);
    assert.ok(c.ratio > 3);
    // the same choices with another key: not the longest, never flagged
    assert.deepEqual(lengthCue(opts, 0), { flagged: false, ratio: Math.round((17 / 61) * 100) / 100, longest: false });
  });
  test("a little longer (≤ 1.15 ×) is longest but not flagged", () => {
    const c = lengthCue(["He walked to the big park.", "She went to the old store.", "They drove to the new beach.", "We rode to the zoo."], 0);
    assert.equal(c.longest, false);
    const d = lengthCue(["He walked to the big park now.", "She went to the old store.", "They drove to the new beach", "We rode to the zoo."], 0);
    assert.equal(d.ratio, 1.11);
    assert.equal(d.longest, true);
    assert.equal(d.flagged, false);
  });
  test("short (one-word / < 4 words) correct choices are never flagged; a tie is not 'longest'", () => {
    assert.equal(lengthCue(["cat", "elephantine", "dog", "ox"], 1).flagged, false);
    assert.equal(lengthCue(["cat", "elephantine", "dog", "ox"], 1).longest, true);
    assert.equal(lengthCue(["one two three four", "five six seven eight", "a b", "c d"], 0).longest, false);
  });
  test("markup and spaces do not count; bad input is never flagged", () => {
    const c = lengthCue(["The <u>very</u> long **answer** text is here now.", "The very long answer text is here now.", "Short one is here.", "Another one here."], 0);
    assert.equal(c.longest, false);
    assert.deepEqual(lengthCue([], 0), { flagged: false, ratio: 0, longest: false });
    assert.deepEqual(lengthCue(["a", "b"], 5), { flagged: false, ratio: 0, longest: false });
    assert.equal(lengthCueOf([{ text: "a b c d e f g h", correct: true }, { text: "x", correct: true }]).flagged, false, "two keys");
  });
  test("AI bank: a generated question whose key is clearly the longest is rejected with the reason", () => {
    const raw = [{ slot: 1, level: 4, cognitiveLevel: "Understand", skillCode: "RL.1", standardCode: "RL.4.1", stem: "Which sentence tells the main idea of the story?",
      options: [{ text: "The fox and the crow argue about the cheese for the whole long afternoon.", correct: true, rationale: null }, { text: "The fox is red.", correct: false, rationale: "detail" }, { text: "The crow sings.", correct: false, rationale: "detail" }, { text: "It is sunny.", correct: false, rationale: "setting" }],
      explanation: "Because.", tip: "" }];
    const r = validateGenerated(raw, { skillCode: "RL.1", standardCodes: ["RL.4.1"], requestedStandard: "RL.4.1", slots: [{ slot: 1, level: 4 }] }, []);
    assert.equal(r.items[0], null);
    assert.ok(r.checks[0].reasons.some((x) => /longest/.test(x)), r.checks[0].reasons.join("; "));
  });
});

describe("✏️ Update answer choices from files + Answer-length check", () => {
  let repo: SqliteRepo;
  let admin: Actor;
  let teacher: Actor;
  let dir: string;
  let qid: string, qOther: string, rrId: string;
  const STEM = "Length test: which sentence best states the central idea of the passage?";
  const CORRECT = "The village learns that sharing water during the drought keeps every family alive and safe.";
  const W = ["The well is deep.", "Rain falls in spring.", "The goats are hungry."];
  const NEW = ["The well is deep, so the families must walk a long way each day to fill their jars.", "Rain falls in spring, and the children wait by the window to watch the clouds roll in.", "The goats are hungry, so the farmers lead them to the hills where some grass is still green."];

  const run = async (apply: boolean): Promise<RewriteChunk[]> => {
    const out: RewriteChunk[] = [];
    if (apply) { for (let i = 0; i < 50; i++) { const r = await applyChunk(repo, admin, { restart: i === 0 }); out.push(r); if (!r.next) break; } return out; }
    let cur: RewriteCursor | null = null;
    for (let i = 0; i < 50; i++) { const r = await rewriteChunk(repo, admin, { apply: false, cursor: cur }); out.push(r); if (!r.next) break; cur = r.next; }
    return out;
  };
  const sum = (rs: RewriteChunk[], src: string, k: "matched" | "toChange" | "upToDate" | "notFound") => rs.reduce((a, r) => a + ((r.counts as Record<string, Record<string, number>>)[src]?.[k] ?? 0), 0);

  before(async () => {
    ({ repo } = await demoDatabase());
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const tu = (await repo.findMany("User", { role: "TEACHER" }))[0];
    teacher = await resolveActor(repo, tu);
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const skillId = s((await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0].id);
    const typeId = s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))?.id ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true })).id);
    const mk = async (ref: string, stem: string, texts: string[], key: number) => {
      const q = await repo.create("Question", { externalRef: ref, skillId, typeId, stem, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", origin: "TEACHER_AUTHORED", createdAt: new Date(), updatedAt: new Date() });
      for (const [i, t] of texts.entries()) await repo.create("QuestionOption", { questionId: q.id, label: "ABCD"[i], text: t, isCorrect: i === key, rationale: i === key ? null : "No.", order: i });
      return s(q.id);
    };
    // the key is the 2nd choice (B); the stem has extra spaces (normalized)
    qid = await mk("LEN-1", `  ${STEM.replace("central idea", "central   idea")} `, [W[0], CORRECT, W[1], W[2]], 1);
    // same stem, DIFFERENT correct answer: never matched
    qOther = await mk("LEN-2", STEM, ["Wells are deep in the dry desert lands of the south.", "Water is shared.", W[1], W[2]], 0);
    const art = await repo.create("RRArticle", { schoolId: null, code: "LEN-RR-1", title: "Length", topic: "test", pollStatement: "Water matters.", status: "PUBLISHED", createdAt: new Date(), updatedAt: new Date() });
    rrId = s((await repo.create("RRQuestion", { articleId: art.id, band: "LOW", number: 1, stem: "RR length: what is the main idea?", options: ["Cats nap.", "Dogs run.", "Many animals in the forest work together to survive the long cold winter months.", "Birds sing."], answer: "C", skill: "central-idea" })).id);
    dir = mkdtempSync(join(tmpdir(), "rewrites-"));
    useRewriteDir(dir);
  });
  after(() => { useRewriteDir(null); rmSync(dir, { recursive: true, force: true }); });

  test("no manifest folder / no files: nothing to do, said on the status", async () => {
    useRewriteDir(join(dir, "missing"));
    const st = await rewriteStatus(repo, admin);
    assert.equal(st.present, false);
    assert.equal(st.entries, 0);
    assert.deepEqual((await rewriteChunk(repo, admin, { apply: false, cursor: null })).counts, {});
    useRewriteDir(dir);
  });

  test("only admins", async () => {
    await assert.rejects(() => rewriteChunk(repo, teacher, { apply: false, cursor: null }), ForbiddenError);
  });

  test("the Answer-length check flags the seeded questions and gives their texts", async () => {
    const rep = await answerLengthReport(repo, admin);
    const ids = rep.flagged.map((f) => f.id);
    assert.ok(ids.includes(qid), "bank question flagged");
    assert.ok(ids.includes(rrId), "ReadRise question flagged");
    assert.ok(rep.overall.checked >= 3 && rep.overall.longest >= 2);
    assert.ok(rep.bySource.some((x) => x.source === "READRISE"));
    const d = await flaggedDetails(repo, rep.flagged.filter((f) => f.id === qid || f.id === rrId));
    const mine = d.find((x) => x.id === qid)!;
    assert.equal(mine.options[mine.correct], CORRECT);
    assert.equal(mine.editHref, `/admin/questions/${qid}`);
    assert.match(d.find((x) => x.id === rrId)!.editHref ?? "", /^\/admin\/readrise\//);
  });

  test("planQuestion (pure): never the correct choice; a missing old text is counted", () => {
    const by = new Map([[STEM, [{ n: 0, stem: STEM, correct: CORRECT, replace: [{ old: W[0], new: NEW[0] }, { old: "Not there", new: "Also not there" }] }]]]);
    const p = planQuestion(STEM, [{ text: W[0], correct: false }, { text: CORRECT, correct: true }], by)!;
    assert.deepEqual(p.changes, [{ index: 0, old: W[0], new: NEW[0] }]);
    assert.equal(p.missing, 1);
    assert.equal(planQuestion(STEM, [{ text: W[0], correct: true }, { text: CORRECT, correct: false }], by), null, "the text must be the CORRECT choice");
  });

  test("preview → apply changes only the wrong choices; a second run changes nothing", async () => {
    writeFileSync(join(dir, "batch-1.json"), JSON.stringify([
      { stem: STEM, correct: CORRECT, replace: W.map((old, i) => ({ old, new: NEW[i] })) },
      // trying to change the correct choice is ignored
      { stem: STEM, correct: CORRECT, replace: [{ old: CORRECT, new: "Hacked" }] },
      { stem: "RR length: what is the main idea?", correct: "Many animals in the forest work together to survive the long cold winter months.", replace: [{ old: "Cats nap.", new: "Cats nap in the warm sun on the porch for most of the day." }] },
      { stem: "A question that is not in the database at all?", correct: "Nothing here to find in this school.", replace: [{ old: "x", new: "y" }] },
    ]));
    writeFileSync(join(dir, "broken.json"), "{ not json");
    const m = readManifest();
    assert.equal(m.entries, 3);
    assert.ok(m.problems.some((p) => p.startsWith("broken.json")) && m.problems.some((p) => p.startsWith("batch-1.json")));
    const before = await repo.findMany("QuestionOption", { questionId: { in: [qid, qOther] } });

    const pv = await run(false);
    assert.equal(sum(pv, "BANK", "matched"), 1);
    assert.equal(sum(pv, "BANK", "toChange"), 1);
    assert.equal(sum(pv, "READRISE", "toChange"), 1);
    assert.equal(new Set(pv.flatMap((r) => r.entries)).size, 2, "the 4th entry is not found");
    assert.ok(pv.flatMap((r) => r.examples).some((e) => e.old === W[0] && e.new === NEW[0]));
    assert.deepEqual(await repo.findMany("QuestionOption", { questionId: { in: [qid, qOther] } }), before, "the preview writes nothing");

    const ap = await run(true);
    assert.equal(ap.reduce((a, r) => a + r.changed, 0), 4);
    const now = (await repo.findMany("QuestionOption", { questionId: qid })).sort((a, b) => Number(a.order) - Number(b.order));
    assert.deepEqual(now.map((o) => s(o.text)), [NEW[0], CORRECT, NEW[1], NEW[2]]);
    assert.deepEqual(now.map((o) => o.isCorrect), [false, true, false, false]);
    assert.deepEqual(now.map((o) => s(o.label)), ["A", "B", "C", "D"]);
    const old = before.filter((o) => s(o.questionId) === qid);
    for (const o of now) { const b = old.find((x) => s(x.id) === s(o.id))!; assert.equal(o.order, b.order); assert.equal(o.rationale, b.rationale); }
    assert.deepEqual((await repo.findMany("QuestionOption", { questionId: qOther })).map((o) => s(o.text)).sort(), before.filter((o) => s(o.questionId) === qOther).map((o) => s(o.text)).sort(), "another correct answer: untouched");
    const rr = await repo.findUnique("RRQuestion", { id: rrId });
    assert.deepEqual(rr!.options, ["Cats nap in the warm sun on the porch for most of the day.", "Dogs run.", "Many animals in the forest work together to survive the long cold winter months.", "Birds sing."]);
    assert.equal(rr!.answer, "C");
    assert.ok((await repo.findMany("AuditLog", { action: "questions.options.rewrite.start" })).length >= 1, "audit-logged");

    const again = await run(true);
    assert.equal(again.reduce((a, r) => a + r.changed, 0), 0, "a second run changes nothing");
    assert.equal(sum(again, "BANK", "upToDate"), 1);
    assert.equal(sum(again, "READRISE", "upToDate"), 1);
    assert.equal((await rewriteStatus(repo, admin)).progress, null, "nothing left to continue");
  });
});

describe("🎯 Picks the longest answer (teacher signal)", () => {
  test("pure: ≥ 12 of each kind and ≥ 35 points apart", () => {
    const rows = (n: number, right: number, longest: boolean) => Array.from({ length: n }, (_, i) => ({ longest, correct: i < right }));
    assert.equal(longestPickOf([...rows(12, 11, true), ...rows(12, 5, false)]).flagged, true);
    assert.equal(longestPickOf([...rows(11, 11, true), ...rows(20, 5, false)]).flagged, false, "too few longest-correct answers");
    assert.equal(longestPickOf([...rows(12, 10, true), ...rows(12, 7, false)]).flagged, false, "only 25 points apart");
    assert.equal(longestOf([{ text: "a b c d e f g", isCorrect: true }, { text: "x", isCorrect: false }, { text: "y", isCorrect: false }]), null, "not 4 choices");
    assert.equal(longestOf([{ text: "cat", isCorrect: true }, { text: "x", isCorrect: false }, { text: "y", isCorrect: false }, { text: "z", isCorrect: false }]), null, "not sentence-like");
  });

  test("from the database: careful answers only, last 60 days", async () => {
    const { repo } = await demoDatabase();
    const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    const g = (await repo.findMany("Grade", { schoolId: admin.schoolId }))[0];
    const cur = (await repo.findMany("Curriculum", { gradeId: g.id }))[0];
    const skillId = s((await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }))[0].id);
    const typeId = s((await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" }))?.id ?? (await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true })).id);
    const students = (await repo.findMany("Student", {}, { take: 2 })).map((x) => s(x.id));
    const mk = async (ref: string, longest: boolean) => {
      const q = await repo.create("Question", { externalRef: ref, skillId, typeId, stem: `Signal ${ref}`, content: {}, difficultyLevel: 4, irtB: 0, status: "PUBLISHED", origin: "TEACHER_AUTHORED", createdAt: new Date(), updatedAt: new Date() });
      const key = longest ? "The children plant trees together so the whole town has shade in summer." : "The children plant trees.";
      const texts = [key, "The town is very hot in summer.", "Some trees grow very tall.", "Summer is long."];
      for (const [i, t] of texts.entries()) await repo.create("QuestionOption", { questionId: q.id, label: "ABCD"[i], text: t, isCorrect: i === 0, order: i });
      return s(q.id);
    };
    const longQ = await mk("SIG-L", true), otherQ = await mk("SIG-O", false);
    const now = new Date();
    for (const st of students) {
      const sess = await repo.create("PracticeSession", { studentId: st, mode: "ADAPTIVE_PRACTICE", skillId, startedAt: now });
      const add = async (qId: string, ok: boolean, rapid = false, daysAgo = 1) => repo.create("QuestionAttempt", { sessionId: sess.id, studentId: st, questionId: qId, skillId, response: { value: ok ? "A" : "B" }, isCorrect: ok, responseMs: 9000, rapidGuess: rapid, difficultyB: 0, createdAt: new Date(now.getTime() - daysAgo * 86_400_000) });
      const picker = st === students[0];
      for (let i = 0; i < 12; i++) await add(longQ, true);
      for (let i = 0; i < 12; i++) await add(otherQ, picker ? i < 4 : i < 11);
      // rapid guesses and old answers never count
      for (let i = 0; i < 20; i++) await add(otherQ, false, true);
      for (let i = 0; i < 20; i++) await add(otherQ, true, false, 90);
    }
    const r = await longestPickers(repo, students, now);
    assert.equal(r.get(students[0])?.flagged, true);
    assert.equal(r.get(students[0])?.otherN, 12);
    assert.equal(r.get(students[1])?.flagged, false);
  });
});
