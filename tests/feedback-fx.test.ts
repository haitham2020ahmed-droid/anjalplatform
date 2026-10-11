/**
 * 🎉 Answer feedback with sound and encouragement (presentation only): phrase picker without an immediate repeat,
 * streak phrases at 3 / 5 / 10, kind words after a wrong answer, a test reveals nothing (a neutral tick only), every
 * phrase translated, and the screens that use it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CORRECT_PHRASES, END_PHRASES, FX_STRINGS, STREAK_PHRASES, WRONG_PHRASES, answerReveal, createStreak, makePicker, streakPhrase } from "../src/components/feedback-fx/phrases";
import { UI_STRINGS } from "../src/i18n/en";
import { ar } from "../src/i18n/ar";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** a repeatable random sequence */
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("🎉 feedback-fx", () => {
  test("about 15 encouraging and 12 kind phrases, all different", () => {
    assert.ok(CORRECT_PHRASES.length >= 15 && WRONG_PHRASES.length >= 12);
    assert.equal(new Set([...CORRECT_PHRASES, ...WRONG_PHRASES]).size, CORRECT_PHRASES.length + WRONG_PHRASES.length);
    assert.ok(CORRECT_PHRASES.includes("Great job!") && CORRECT_PHRASES.includes("You're on fire! 🔥"));
    assert.ok(WRONG_PHRASES.includes("Nice try! Let's look at it together.") && WRONG_PHRASES.includes("Almost! You can do it 💪"));
  });

  test("the phrase picker never repeats the same phrase twice in a row", () => {
    // a random source that keeps asking for the same index
    const same = makePicker(CORRECT_PHRASES, () => 0.1);
    let last = "";
    for (let i = 0; i < 50; i++) { const p = same(); assert.notEqual(p, last, `pick ${i}`); last = p; }
    const rnd = makePicker(WRONG_PHRASES);
    last = "";
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) { const p = rnd(); assert.notEqual(p, last); assert.ok(WRONG_PHRASES.includes(p as never)); seen.add(p); last = p; }
    assert.ok(seen.size > WRONG_PHRASES.length / 2, "varied");
    const two = makePicker(["a", "b"], seq([0, 0, 0.9, 0.9]));
    assert.deepEqual([two(), two(), two(), two()], ["a", "b", "a", "b"]);
    assert.equal(makePicker(["only"])(), "only");
  });

  test("streaks: 3 / 5 / 10 in a row get their own phrase; a wrong answer starts again", () => {
    assert.equal(streakPhrase(3), "3 in a row! 🌟");
    assert.ok(streakPhrase(5) && streakPhrase(10));
    for (const n of [0, 1, 2, 4, 6, 9, 11]) assert.equal(streakPhrase(n), null, String(n));
    const s = createStreak();
    const pick = { correct: () => "Brilliant!", wrong: () => "Almost! You can do it 💪" };
    const phrases = [true, true, true, true, true].map((c) => answerReveal("practice", c, s.record(c), pick).phrase);
    assert.deepEqual(phrases, ["Brilliant!", "Brilliant!", STREAK_PHRASES[3], "Brilliant!", STREAK_PHRASES[5]]);
    assert.equal(s.record(false), 0);
    assert.equal(answerReveal("practice", true, s.record(true), pick).phrase, "Brilliant!", "the streak starts again");
  });

  test("practice: a chime + an encouraging phrase + confetti when right; a soft tone + a kind phrase when wrong", () => {
    const pick = { correct: () => "Brilliant!", wrong: () => "Nice try! Let's look at it together." };
    assert.deepEqual(answerReveal("practice", true, 1, pick), { sound: "chime", phrase: "Brilliant!", reveal: true, confetti: true });
    assert.deepEqual(answerReveal("practice", false, 0, pick), { sound: "soft", phrase: "Nice try! Let's look at it together.", reveal: true, confetti: false });
  });

  test("a test reveals nothing: a neutral tick and 'Answer saved', never right or wrong", () => {
    const pick = { correct: () => "Brilliant!", wrong: () => "Almost!" };
    const right = answerReveal("test", true, 10, pick), wrong = answerReveal("test", false, 0, pick);
    assert.deepEqual(right, wrong, "the same whatever the answer");
    assert.deepEqual(right, { sound: "tick", phrase: "Answer saved", reveal: false, confetti: false });
    // the test player: in test mode only the tick (no feedback panel, no phrase)
    const quiz = read("src/app/quiz/[assignmentId]/quiz-player.tsx");
    const testBranch = quiz.slice(quiz.indexOf("if (view.testMode) {"), quiz.indexOf("setFb(r.feedback!)"));
    assert.match(testBranch, /answerSavedFx\(\)/);
    assert.doesNotMatch(testBranch, /AnswerFx|FeedbackPanel|correct/);
    assert.doesNotMatch(quiz, /<AnswerFx/, "no phrase on the test screen");
  });

  test("every phrase goes through t() with an Arabic translation", () => {
    const ui = new Set<string>(UI_STRINGS);
    for (const p of [...FX_STRINGS, ...END_PHRASES]) {
      assert.ok(ui.has(p), `en.ts: ${p}`);
      assert.ok((ar as Record<string, string>)[p]?.trim(), `ar.ts: ${p}`);
    }
  });

  test("used in practice, ReadMaster, ReadRise and the Question of the Day; mute remembered; reduced motion respected", () => {
    assert.match(read("src/components/practice/feedback-panel.tsx"), /<AnswerFx /);
    assert.match(read("src/components/practice/practice-frame.tsx"), /<CelebrateFx /);
    assert.match(read("src/components/readmaster/player.tsx"), /<AnswerFx |<CelebrateFx /);
    assert.match(read("src/components/readrise/reader.tsx"), /<AnswerFx /);
    assert.match(read("src/components/student/qotd.tsx"), /<AnswerFx /);
    const fx = read("src/components/feedback-fx/answer-fx.tsx");
    assert.match(fx, /prefers-reduced-motion/);
    assert.match(fx, /motion-safe:animate-pop/);
    assert.match(fx, /t\(fx\.phrase\)/);
    const kit = read("src/games/kit/sound.ts");
    assert.match(kit, /try \{ return localStorage\.getItem/, "mute read in try/catch (default: sound on)");
    assert.match(kit, /try \{ localStorage\.setItem/);
    // the soft tone is gentle: a sine wave, quiet and low
    const snd = read("src/components/feedback-fx/sound.ts");
    assert.match(snd, /soft: \{ wave: "sine"/);
    // presentation only: nothing here writes data
    for (const f of ["answer-fx.tsx", "phrases.ts", "sound.ts"]) assert.doesNotMatch(read(`src/components/feedback-fx/${f}`), /server\/|repo\.|fetch\(/, f);
  });
});
