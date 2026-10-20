import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isScopeFlagged, scopeRuleFor } from "../src/server/admin/scope-check";

describe("🔎 scope-check: flags a question whose own text doesn't look related to its skill", () => {
  test("Active and Passive Voice: a real voice question is never flagged", () => {
    const cases = [
      "Which sentence is in the passive voice?",
      "The window was broken by Sam.",
      "Choose the verb that makes the sentence passive: The classroom windows ____ every Thursday.",
      "The cake was made by Mom.",
      "Which word correctly completes the sentence: The window was broken ____ the wind.",
    ];
    for (const c of cases) assert.equal(isScopeFlagged("Active and Passive Voice", c), false, c);
  });

  test("Active and Passive Voice: unrelated word-choice / usage questions ARE flagged", () => {
    const cases = [
      "Which word correctly completes the sentence? Marcus sat ___ his brother at the game.",
      "Which word correctly completes the sentence? The cat licked ___ paws after eating.",
      "Which word correctly completes the sentence? The pie was baking ___ the oven.",
    ];
    for (const c of cases) assert.equal(isScopeFlagged("Active and Passive Voice", c), true, c);
  });

  test("a skill with no configured rule is never flagged", () => {
    assert.equal(isScopeFlagged("Figurative Language", "anything at all"), false);
    assert.equal(scopeRuleFor("Figurative Language"), null);
  });

  test("the rule name-match ignores case and surrounding spaces", () => {
    assert.ok(scopeRuleFor("  active AND passive voice  "));
  });
});
