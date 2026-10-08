/**
 * 🌉 Cross-Grade Bridge. Every category of a Text Set / Selection (Concept Vocabulary, Analyze Craft and
 * Structure, Respond to Reading) is linked to the SAME skill one grade up (🚀 challenge: a harder, real
 * higher-grade text for Above Level students) and one grade down (🛟 support: an easier text for Below Level
 * students). No question is copied: the adaptive engine simply draws from the linked places.
 * Automatic match = overlap of skill words (strongest) + same genre + closest position in the school year.
 * A school's own sheet (import) or edits override the automatic match place by place.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes, mapEpoch, type AttachmentNode } from "./questions";

const s = (v: unknown) => String(v ?? "");
const STOP = new Set(["and", "the", "of", "a", "an", "to", "in", "on", "for", "with", "reread", "text"]);
const words = (t: string | null | undefined) => new Set(s(t).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const catType = (code: string) => code.split(".").pop() as "CV" | "ACS" | "RTR";
const setOf = (code: string) => code.split(".").slice(0, 3).join(".");

interface SetInfo { set: string; grade: number; order: number; genre: string; heading: string; words: Set<string>; cats: Set<string> }

function setsByGrade(nodes: AttachmentNode[]): Map<number, SetInfo[]> {
  const bySet = new Map<string, SetInfo>();
  for (const n of nodes) {
    const key = setOf(n.code);
    let si = bySet.get(key);
    if (!si) { si = { set: key, grade: n.grade, order: n.unit * 10 + n.setNumber, genre: s(n.genre).toLowerCase(), heading: n.heading, words: new Set(), cats: new Set() }; bySet.set(key, si); }
    for (const w of words(n.skills)) si.words.add(w);
    si.cats.add(catType(n.code.replace(/\.(ABOVE|ON|BELOW)$/, "")));
  }
  const out = new Map<number, SetInfo[]>();
  for (const si of bySet.values()) out.set(si.grade, [...(out.get(si.grade) ?? []), si]);
  for (const list of out.values()) list.sort((a, b) => a.order - b.order);
  return out;
}

function bestMatch(from: SetInfo, fromIx: number, fromCount: number, candidates: SetInfo[]): SetInfo | null {
  if (!candidates.length) return null;
  const rel = fromCount > 1 ? fromIx / (fromCount - 1) : 0;
  let best: SetInfo | null = null, bestScore = -1;
  candidates.forEach((c, i) => {
    const overlap = [...from.words].filter((w) => c.words.has(w)).length;
    const union = new Set([...from.words, ...c.words]).size || 1;
    const pos = 1 - Math.abs(rel - (candidates.length > 1 ? i / (candidates.length - 1) : 0));
    const score = (overlap / union) * 10 + (from.genre && from.genre === c.genre ? 2 : 0) + pos;
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best;
}

export interface BridgeRow { from: string; fromLabel: string; grade: number; challenge: string | null; challengeLabel: string | null; support: string | null; supportLabel: string | null; source: "AUTO" | "IMPORT" | "MANUAL" }

const bridgeCache = new WeakMap<object, Map<string, { at: number; value: Promise<BridgeRow[]> }>>();
let bridgeEpoch = 0;
/** Every category's bridge (the school's rows first, else the automatic match). Cached for 60 s. */
export async function bridges(repo: Repo, schoolId: string, grade?: number): Promise<BridgeRow[]> {
  let perRepo = bridgeCache.get(repo as object);
  if (!perRepo) { perRepo = new Map(); bridgeCache.set(repo as object, perRepo); }
  const key = `${schoolId}#${bridgeEpoch}#${mapEpoch()}`;
  let hit = perRepo.get(key);
  if (!hit || Date.now() - hit.at > 60_000) { hit = { at: Date.now(), value: computeBridges(repo, schoolId) }; perRepo.set(key, hit); hit.value.catch(() => perRepo!.delete(key)); }
  const all = await hit.value;
  return grade ? all.filter((r) => r.grade === grade) : all;
}

async function computeBridges(repo: Repo, schoolId: string, grade?: number): Promise<BridgeRow[]> {
  const nodes = await attachmentNodes(repo, schoolId);
  const sets = setsByGrade(nodes);
  const label = new Map<string, string>();
  for (const n of nodes) { const cat = n.code.replace(/\.(ABOVE|ON|BELOW)$/, ""); if (!label.has(cat)) label.set(cat, `G${n.grade} · ${n.unitTitle.split(":")[0]} · ${n.heading} · ${n.categoryLabel.replace(/^\d+-\s*/, "")}`); }
  const saved = new Map((await repo.findMany("CrossGradeBridge", { schoolId })).map((r) => [s(r.fromCode), r]));
  const catIn = (set: SetInfo | null, type: string) => (set ? (set.cats.has(type) ? `${set.set}.${type}` : set.cats.has("ACS") ? `${set.set}.ACS` : null) : null);
  const rows: BridgeRow[] = [];
  for (const [g, list] of [...sets].sort((a, b) => a[0] - b[0])) {
    if (grade && g !== grade) continue;
    list.forEach((si, ix) => {
      for (const type of ["CV", "ACS", "RTR"]) {
        if (!si.cats.has(type)) continue;
        const from = `${si.set}.${type}`;
        const auto = { challenge: catIn(bestMatch(si, ix, list.length, sets.get(g + 1) ?? []), type), support: catIn(bestMatch(si, ix, list.length, sets.get(g - 1) ?? []), type) };
        const own = saved.get(from);
        const challenge = own ? (own.challengeCode ? s(own.challengeCode) : null) : auto.challenge;
        const support = own ? (own.supportCode ? s(own.supportCode) : null) : auto.support;
        rows.push({ from, fromLabel: label.get(from) ?? from, grade: g, challenge, challengeLabel: challenge ? label.get(challenge) ?? challenge : null, support, supportLabel: support ? label.get(support) ?? support : null, source: own ? (s(own.source) as "IMPORT" | "MANUAL") : "AUTO" });
      }
    });
  }
  return rows;
}

/** The bridge of one category (used when assigning adaptively). */
export async function bridgeOf(repo: Repo, schoolId: string, categoryCode: string): Promise<{ challenge: string | null; support: string | null }> {
  const code = categoryCode.trim().toUpperCase();
  const g = Number(code.match(/^G(\d+)\./)?.[1] ?? 0);
  const row = (await bridges(repo, schoolId, g)).find((r) => r.from === code);
  return { challenge: row?.challenge ?? null, support: row?.support ?? null };
}

/** Imports the school's own Cross-Grade Bridge sheet: columns From, Challenge, Support (codes). */
export async function importBridges(repo: Repo, actor: Actor, table: string[][], now = new Date()): Promise<{ saved: number; errors: { row: number; message: string }[] }> {
  assertCan(actor, "curriculum:edit");
  if (actor.role === "TEACHER") throw new ForbiddenError("Admins edit the Cross-Grade Bridge.");
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  const head = (table[at] ?? []).map((h) => s(h).toLowerCase().replace(/[^a-z]/g, ""));
  const col = (names: string[]) => head.findIndex((h) => names.includes(h));
  const cFrom = col(["from", "fromcode", "textset", "place", "code"]), cUp = col(["challenge", "challengecode", "nextgrade", "above"]), cDown = col(["support", "supportcode", "previousgrade", "below"]);
  if (cFrom < 0 || (cUp < 0 && cDown < 0)) throw new ValidationError("The sheet needs the columns From, Challenge and/or Support (download the current bridge as a template).");
  const known = new Set((await attachmentNodes(repo, actor.schoolId!)).map((n) => n.code.replace(/\.(ABOVE|ON|BELOW)$/, "")));
  const errors: { row: number; message: string }[] = [];
  let saved = 0;
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i]; const row = i + 1;
    const from = s(r[cFrom]).trim().toUpperCase();
    if (!from) continue;
    const up = cUp >= 0 ? s(r[cUp]).trim().toUpperCase() : "", down = cDown >= 0 ? s(r[cDown]).trim().toUpperCase() : "";
    const g = Number(from.match(/^G(\d+)\./)?.[1] ?? 0);
    const bad = [[from, 0], [up, 1], [down, -1]].filter(([c]) => c).find(([c, d]) => !known.has(String(c)) || Number(String(c).match(/^G(\d+)\./)?.[1] ?? 0) !== g + Number(d));
    if (bad) { errors.push({ row, message: `${bad[0]} is not a ${Number(bad[1]) === 1 ? `Grade ${g + 1}` : Number(bad[1]) === -1 ? `Grade ${g - 1}` : "known"} category of the Curriculum Map.` }); continue; }
    bridgeEpoch++;
    await repo.upsert("CrossGradeBridge", { schoolId: actor.schoolId, fromCode: from }, { challengeCode: up || null, supportCode: down || null, source: "IMPORT", updatedAt: now }, { schoolId: actor.schoolId, fromCode: from, challengeCode: up || null, supportCode: down || null, source: "IMPORT", updatedAt: now });
    saved++;
  }
  return { saved, errors };
}

export async function resetBridges(repo: Repo, actor: Actor): Promise<number> {
  assertCan(actor, "curriculum:edit");
  if (actor.role === "TEACHER") throw new ForbiddenError("Admins edit the Cross-Grade Bridge.");
  bridgeEpoch++;
  return repo.deleteMany("CrossGradeBridge", { schoolId: actor.schoolId });
}
