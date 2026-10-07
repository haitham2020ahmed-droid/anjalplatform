import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { anthropicProvider, chooseAiProvider, geminiProvider, parseGenerated } from "../src/server/ai/question-generator";

/** A fake fetch that records the request and answers with the given status and JSON body. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const REPLY = '{"questions":[{"slot":1,"stem":"Which word is a noun?"}]}';

describe("Gemini provider", () => {
  test("sends the system and user prompt to generateContent with the key in a header, and returns the text", async () => {
    const { f, calls } = fakeFetch(200, { candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: REPLY }] }, finishReason: "STOP" }] });
    const out = await geminiProvider({ apiKey: "AQ.TEST", model: "gemini-3.5-flash", fetchImpl: f }).complete("SYSTEM", "USER");
    assert.equal(out, REPLY, "thinking parts are left out");
    assert.equal(parseGenerated(out).length, 1);
    assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["x-goog-api-key"], "AQ.TEST");
    assert.ok(!calls[0].url.includes("AQ.TEST"), "the key is never in the URL (URLs end up in logs)");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.systemInstruction, { parts: [{ text: "SYSTEM" }] });
    assert.deepEqual(body.contents, [{ role: "user", parts: [{ text: "USER" }] }]);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
  });

  test("every failure has a message an admin can act on (and never shows the key)", async () => {
    const msg = async (status: number, body: unknown) => {
      const { f } = fakeFetch(status, body);
      return (await geminiProvider({ apiKey: "AQ.SECRET", model: "gemini-x", fetchImpl: f }).complete("s", "u").catch((e: Error) => e.message)) as string;
    };
    assert.match(await msg(400, { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }), /Gemini API key is not valid.*GEMINI_API_KEY/);
    assert.match(await msg(403, { error: {} }), /not valid/);
    assert.match(await msg(401, { error: { status: "UNAUTHENTICATED", details: [{ reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED" }] } }), /did not accept this Gemini key.*create a new key/);
    assert.match(await msg(429, { error: { status: "RESOURCE_EXHAUSTED" } }), /free usage limit/);
    assert.match(await msg(404, { error: {} }), /model “gemini-x” was not found.*GEMINI_MODEL/);
    assert.match(await msg(503, "overloaded"), /temporarily unavailable/);
    assert.match(await msg(200, { promptFeedback: { blockReason: "SAFETY" } }), /refused the request \(SAFETY\)/);
    assert.match(await msg(200, { candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }), /cut off/);
    assert.match(await msg(200, { candidates: [] }), /no answer/);
    for (const s of [400, 403, 429, 404, 503]) assert.doesNotMatch(await msg(s, { error: {} }), /AQ\.SECRET/);
  });

  test("Claude: an invalid key now says which setting to fix", async () => {
    const { f } = fakeFetch(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
    await assert.rejects(anthropicProvider({ apiKey: "sk-ant-x", model: "m", fetchImpl: f }).complete("s", "u"), /Claude API key is not valid.*ANTHROPIC_API_KEY/);
  });
});

describe("choosing the AI provider from the server settings", () => {
  test("Gemini when its key is set (default model gemini-3.5-flash), else Claude, else a setup message", () => {
    assert.deepEqual(chooseAiProvider({ GEMINI_API_KEY: "AIzaG" }), { provider: "gemini", apiKey: "AIzaG", model: "gemini-3.5-flash" });
    assert.deepEqual(chooseAiProvider({ GEMINI_API_KEY: " AIzaG ", GEMINI_MODEL: "gemini-2.5-flash" }), { provider: "gemini", apiKey: "AIzaG", model: "gemini-2.5-flash" });
    assert.deepEqual(chooseAiProvider({ ANTHROPIC_API_KEY: "sk-ant-1", AI_MODEL: "claude-x" }), { provider: "anthropic", apiKey: "sk-ant-1", model: "claude-x" });
    assert.equal((chooseAiProvider({ GEMINI_API_KEY: "AIzaG", ANTHROPIC_API_KEY: "sk-ant-1" }) as { provider: string }).provider, "gemini");
    assert.match((chooseAiProvider({}) as { error: string }).error, /add GEMINI_API_KEY .* or ANTHROPIC_API_KEY/);
    assert.match((chooseAiProvider({ GEMINI_API_KEY: "  " }) as { error: string }).error, /not set up/);
  });

  test("a Google key put in ANTHROPIC_API_KEY by mistake is used for Gemini (new AQ. keys and old AIza keys)", () => {
    assert.deepEqual(chooseAiProvider({ ANTHROPIC_API_KEY: "AIzaWRONGPLACE" }), { provider: "gemini", apiKey: "AIzaWRONGPLACE", model: "gemini-3.5-flash" });
    assert.deepEqual(chooseAiProvider({ ANTHROPIC_API_KEY: "AQ.Ab8WRONGPLACE" }), { provider: "gemini", apiKey: "AQ.Ab8WRONGPLACE", model: "gemini-3.5-flash" });
    assert.deepEqual(chooseAiProvider({ GEMINI_API_KEY: "AQ.Ab8NEW" }), { provider: "gemini", apiKey: "AQ.Ab8NEW", model: "gemini-3.5-flash" });
    assert.match((chooseAiProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "AIzaX" }) as { error: string }).error, /holds a Google key/);
  });

  test("AI_PROVIDER forces one provider", () => {
    assert.equal((chooseAiProvider({ AI_PROVIDER: "anthropic", GEMINI_API_KEY: "AIzaG", ANTHROPIC_API_KEY: "sk-ant-1" }) as { provider: string }).provider, "anthropic");
    assert.equal((chooseAiProvider({ AI_PROVIDER: "Claude", ANTHROPIC_API_KEY: "sk-ant-1" }) as { provider: string }).provider, "anthropic");
    assert.match((chooseAiProvider({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "sk-ant-1" }) as { error: string }).error, /GEMINI_API_KEY is not set/);
    assert.match((chooseAiProvider({ AI_PROVIDER: "openai" }) as { error: string }).error, /must be “gemini” or “anthropic”/);
  });
});
