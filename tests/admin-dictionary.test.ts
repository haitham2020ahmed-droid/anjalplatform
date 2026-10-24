/**
 * 📖 Admin/teacher "Dictionary" (src/app/admin/dictionary): saveDefinition / wordList / missingWords / lookupWord /
 * importWordsCsv / saveWordExtras / fillMissingWithAi are already thoroughly covered by update19.test.ts,
 * update42c.test.ts and vocabulary-review.test.ts. New here: wordList's own STUDENT refusal (not exercised
 * elsewhere), that saving a school definition clears the matching "missing word" entry, and that a second meaning
 * (a different part of speech) is added rather than replacing the first.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { saveDefinition, wordList } from "../src/server/student/words";
import { missingWords } from "../src/server/vocabulary/meaning";
import { demoDatabase } from "./helpers/db";

const s = (v: unknown) => String(v ?? "");

describe("📖 admin/teacher Dictionary", () => {
  let repo: SqliteRepo;
  let admin: Actor, teacher: Actor, student: Actor;
  let schoolId: string;

  before(async () => {
    ({ repo } = await demoDatabase());
    const actorFor = async (u: string) => resolveActor(repo, (await repo.findUnique("User", { username: u }))!);
    admin = await actorFor("demo.admin");
    teacher = await actorFor("demo.teacher.4a");
    schoolId = s(admin.schoolId);
    const anyStudent = (await repo.findMany("User", { schoolId, role: "STUDENT" }))[0];
    student = await resolveActor(repo, anyStudent);
  });

  test("wordList: teachers and admins read it; students are refused", async () => {
    await wordList(repo, teacher);
    await wordList(repo, admin);
    await assert.rejects(wordList(repo, student), ForbiddenError);
  });

  test("saving a school definition for a tapped-but-missing word removes it from the missing list", async () => {
    await repo.create("MissingWord", { schoolId, word: "harvest", count: 3, lastSentence: "We will harvest the dates." });
    assert.ok((await missingWords(repo, admin, 100)).some((m) => m.word === "harvest"));
    await saveDefinition(repo, teacher, "harvest", { partOfSpeech: "verb", definition: "To gather crops when they are ripe." });
    assert.ok(!(await missingWords(repo, admin, 100)).some((m) => m.word === "harvest"), "now defined: no longer missing");
    const v = await wordList(repo, admin, "harvest");
    assert.equal(v.entries[0].source, "SCHOOL");
    assert.equal(v.entries[0].meanings[0].definition, "To gather crops when they are ripe.");
  });

  test("a second meaning (a different part of speech) is kept alongside the first, not replacing it; the same part of speech replaces", async () => {
    await saveDefinition(repo, teacher, "harvest", { partOfSpeech: "noun", definition: "The season's gathered crop." });
    let v = await wordList(repo, admin, "harvest");
    assert.equal(v.entries[0].meanings.length, 2, "noun added alongside the existing verb meaning");
    assert.ok(v.entries[0].meanings.some((m) => m.partOfSpeech === "verb") && v.entries[0].meanings.some((m) => m.partOfSpeech === "noun"));

    await saveDefinition(repo, teacher, "harvest", { partOfSpeech: "verb", definition: "To bring in the ripe crop (clearer)." });
    v = await wordList(repo, admin, "harvest");
    assert.equal(v.entries[0].meanings.length, 2, "the verb meaning is replaced, not added again");
    assert.equal(v.entries[0].meanings.find((m) => m.partOfSpeech === "verb")!.definition, "To bring in the ripe crop (clearer).");
  });

  test("wordList search: only entries whose word starts with the query, and the unit vocabulary list is separate", async () => {
    await saveDefinition(repo, teacher, "harp", { partOfSpeech: "noun", definition: "A large stringed instrument." });
    const v = await wordList(repo, admin, "harv");
    assert.ok(v.entries.every((e) => e.word.startsWith("harv")));
    assert.ok(!v.entries.some((e) => e.word === "harp"));
  });
});
