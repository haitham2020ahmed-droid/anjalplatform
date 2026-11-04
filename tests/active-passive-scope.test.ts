import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { loadSkillSetsFile, type SkillSet } from "../src/server/questions/skill-sets";

/**
 * Guards the "Active and Passive Voice" skill against drifting in off-topic questions (e.g. plain comprehension
 * items with no passive/active contrast at all). Every question's text — stem, options, grid rows, matching pairs,
 * sentence-order pieces, error-correction segments — must mention voice itself or a verb form that marks it
 * (a form of "be" + past participle, "by" + doer, "active"/"passive", a tense name used with "passive", etc.).
 */
const PACKS = ["grammar-extra-sets.json", "span-skill-sets.json", "topup-skill-sets.json", "gap-skill-sets.json"];
const SKILL = "Active and Passive Voice";

/** Every bit of text on a question that a student or teacher would read. */
function textOf(q: Record<string, unknown>): string {
  const parts: string[] = [String(q.stem ?? ""), String(q.why ?? "")];
  if (Array.isArray(q.options)) parts.push(...(q.options as unknown[]).map(String));
  if (Array.isArray(q.segments)) parts.push(...(q.segments as unknown[]).map(String));
  if (Array.isArray(q.sequence)) parts.push(...(q.sequence as unknown[]).map(String));
  if (Array.isArray(q.pairs)) for (const p of q.pairs as { left?: unknown; right?: unknown }[]) parts.push(String(p.left ?? ""), String(p.right ?? ""));
  const grid = q.grid as { rows?: { text?: unknown }[]; columns?: { text?: unknown }[] } | undefined;
  if (grid?.rows) parts.push(...grid.rows.map((r) => String(r.text ?? "")));
  if (grid?.columns) parts.push(...grid.columns.map((c) => String(c.text ?? "")));
  const hot = q.hotText as { segments?: { text?: unknown }[] } | undefined;
  if (hot?.segments) parts.push(...hot.segments.map((s) => String(s.text ?? "")));
  const two = q.twoPart as { partA?: { stem?: unknown; options?: { text?: unknown }[] }; partB?: { stem?: unknown; options?: { text?: unknown }[] } } | undefined;
  if (two) {
    for (const part of [two.partA, two.partB]) {
      if (!part) continue;
      parts.push(String(part.stem ?? ""));
      if (Array.isArray(part.options)) parts.push(...part.options.map((o) => String(o.text ?? "")));
    }
  }
  return parts.join(" ").toLowerCase();
}

/** A form of "be" immediately followed by a past participle (-ed, or an irregular one listed here) marks the passive. */
const BE = /\b(is|are|am|was|were|be|been|being)\b/;
const PARTICIPLE = /\b(\w+ed|built|given|driven|sent|taken|made|written|broken|shown|known|grown|held|sold|bought|caught|taught|told|kept|left|found|run|done|seen|stolen|worn|borrowed|mapped|fed|hidden|cut)\b/;
const VOICE_WORDS = /\b(active|passive|voice|doer|agent|by\s+\w+)\b/;

function isOnTopic(text: string): boolean {
  if (VOICE_WORDS.test(text)) return true;
  return BE.test(text) && PARTICIPLE.test(text);
}

describe("question bank scope: Active and Passive Voice", () => {
  test("every question across all packs is actually about active/passive voice (no off-topic comprehension drift)", async () => {
    const offTopic: string[] = [];
    let total = 0;
    for (const file of PACKS) {
      const sets: SkillSet[] = await loadSkillSetsFile(file);
      const set = sets.find((s) => s.skill === SKILL);
      if (!set) continue;
      for (const q of set.questions as unknown as Record<string, unknown>[]) {
        total++;
        const text = textOf(q);
        if (!isOnTopic(text)) offTopic.push(`${file} ${String(q.ref)}: ${String(q.stem).slice(0, 100)}`);
      }
    }
    assert.ok(total > 50, `expected the Active and Passive Voice skill to have a substantial question bank, found ${total}`);
    assert.deepEqual(offTopic, [], `off-topic questions found under "Active and Passive Voice":\n${offTopic.join("\n")}`);
  });

  test("the skill's questions span the main active/passive tenses (not just present/past simple)", async () => {
    const all: Record<string, unknown>[] = [];
    for (const file of PACKS) {
      const sets: SkillSet[] = await loadSkillSetsFile(file);
      const set = sets.find((s) => s.skill === SKILL);
      if (set) all.push(...(set.questions as unknown as Record<string, unknown>[]));
    }
    const text = all.map((q) => textOf(q)).join(" ");
    for (const marker of [/\bwas\b|\bwere\b/, /\bwill be\b/, /\bhas been\b|\bhave been\b/, /\bhad been\b/, /\bis being\b|\bare being\b/, /\bmust be\b|\bshould be\b|\bcan be\b|\bmight be\b/]) {
      assert.match(text, marker);
    }
  });
});
