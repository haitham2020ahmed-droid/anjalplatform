import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseAnswerInput } from "../src/server/practice/answer-input";
import { ValidationError } from "../src/server/curriculum-admin";

describe("answer submission parsing (practice and placement)", () => {
  test("keeps any answer value exactly, including false, 0, empty string, lists and objects", () => {
    for (const response of ["B", false, 0, "", ["A", "C"], { big: "large" }, null]) {
      assert.deepEqual(parseAnswerInput({ sessionId: "s1", questionId: "q1", response }), { sessionId: "s1", questionId: "q1", response });
    }
  });

  test("drops unexpected fields (only the three known fields reach the scorer)", () => {
    const r = parseAnswerInput({ sessionId: "s1", questionId: "q1", response: "A", usedHint: true, isCorrect: true });
    assert.deepEqual(Object.keys(r).sort(), ["questionId", "response", "sessionId"]);
  });

  test("refuses a missing answer and invalid ids with a clear validation error", () => {
    assert.throws(() => parseAnswerInput({ sessionId: "s1", questionId: "q1" }), (e: Error) => e instanceof ValidationError && /Choose an answer/.test(e.message));
    assert.throws(() => parseAnswerInput({ sessionId: "s1", questionId: "q1", response: undefined }), ValidationError);
    for (const bad of [null, "x", [], { sessionId: "", questionId: "q", response: 1 }, { sessionId: "s", questionId: 5, response: 1 }, { sessionId: "s".repeat(192), questionId: "q", response: 1 }])
      assert.throws(() => parseAnswerInput(bad), ValidationError, JSON.stringify(bad)?.slice(0, 40));
  });
});
