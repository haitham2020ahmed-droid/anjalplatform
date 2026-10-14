/**
 * 🚀 ReadRise content files read at run time (not seeded): the placement passages in data/readrise/placement.json
 *   { passages: [{ id, level, title, text, questions: [{ stem, options[4], answer, skill }] ×3 }] }  — 3 per level 300…1400.
 * The file is read once and cached (re-read when it changes on disk). A missing or broken file gives no passages
 * (the placement page then says the test is not ready yet) — it never crashes a page.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RR_LEVELS } from "./level";
// r68 (owner: "a student saw articles and no placement card"): the placement file is read from the working directory,
// which the server image may not have (the standalone build carries only what it traces) — no passages meant "test
// not ready": no card AND the articles unlocked. The file is now also bundled: a missing file falls back to it.
import bundledPlacement from "../../../data/readrise/placement.json";

export interface PlacementQuestion { stem: string; options: string[]; /** A | B | C | D */ answer: string; skill: string }
export interface PlacementPassage { id: string; level: number; title: string; text: string; questions: PlacementQuestion[] }

const LETTERS = ["A", "B", "C", "D"];
let cache: { path: string; mtimeMs: number; passages: PlacementPassage[] } | null = null;

/** Accepts "A".."D", "a", 0..3 or the option text itself. */
function toLetter(answer: unknown, options: string[]): string | null {
  if (typeof answer === "number" && answer >= 0 && answer < options.length) return LETTERS[answer];
  const a = String(answer ?? "").trim();
  if (/^[A-Da-d]$/.test(a)) return a.toUpperCase();
  const i = options.findIndex((o) => o.trim() === a);
  return i >= 0 ? LETTERS[i] : null;
}

/** Validates and normalises raw JSON; invalid passages are skipped (never half-used). */
export function parsePlacement(raw: unknown): PlacementPassage[] {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { passages?: unknown }).passages)) ? (raw as { passages: unknown[] }).passages : [];
  const out: PlacementPassage[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const id = String(r.id ?? "").trim(), level = Number(r.level), text = String(r.text ?? "").trim();
    if (!id || seen.has(id) || !(RR_LEVELS as readonly number[]).includes(level) || !text) continue;
    const qs: PlacementQuestion[] = [];
    for (const q of Array.isArray(r.questions) ? r.questions : []) {
      const qq = q as Record<string, unknown>;
      const options = Array.isArray(qq.options) ? qq.options.map(String) : [];
      const answer = toLetter(qq.answer, options);
      if (!qq.stem || options.length !== 4 || !answer) continue;
      qs.push({ stem: String(qq.stem), options, answer, skill: String(qq.skill ?? "") });
    }
    if (qs.length !== 3) continue;
    seen.add(id);
    out.push({ id, level, title: String(r.title ?? ""), text, questions: qs });
  }
  return out;
}

/** The placement passages (cached). `root` defaults to the working directory (the app root). */
export function loadPlacementPassages(root: string = process.cwd()): PlacementPassage[] {
  const path = join(root, "data", "readrise", "placement.json");
  try {
    const { mtimeMs } = statSync(path);
    if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.passages;
    const passages = parsePlacement(JSON.parse(readFileSync(path, "utf8")));
    if (passages.length < 5 && root === process.cwd()) return bundled();
    cache = { path, mtimeMs, passages };
    return passages;
  } catch {
    // the app's own file is missing on this server: the copy bundled with the code (a test's own folder: nothing)
    return root === process.cwd() ? bundled() : [];
  }
}
let bundledCache: PlacementPassage[] | null = null;
const bundled = (): PlacementPassage[] => (bundledCache ??= parsePlacement(bundledPlacement));
