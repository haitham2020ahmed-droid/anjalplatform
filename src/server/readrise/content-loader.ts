/**
 * 🚀 ReadRise content files read at run time (not seeded): the placement passages in data/readrise/placement.json
 *   { passages: [{ id, level, title, text, questions: [{ stem, options[4], answer, skill }] ×3 }] }  — 3 per level 300…1600.
 * Round 6 (owner, Achieve3000-like): PLUS data/readrise/placement-extra.json when it exists (the SAME format) — more
 * passages per level and passages BELOW the lowest version (levels −200 "BR200", 0, 100, 200) so a weak reader can be
 * measured below 300. A passage level is a multiple of 100 from PLACEMENT_LOW (−200) to RR_MAX (1600). Ids must be
 * unique across both files (a duplicate id in the extra file is skipped). The extra file is optional: missing or
 * broken, the test runs on placement.json alone.
 * The files are read once and cached (re-read when they change on disk). A missing or broken file gives no passages
 * (the placement page then says the test is not ready yet) — it never crashes a page.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RR_MAX } from "./level";
// r68 (owner: "a student saw articles and no placement card"): the placement file is read from the working directory,
// which the server image may not have (the standalone build carries only what it traces) — no passages meant "test
// not ready": no card AND the articles unlocked. The file is now also bundled: a missing file falls back to it.
import bundledPlacement from "../../../data/readrise/placement.json";

export interface PlacementQuestion { stem: string; options: string[]; /** A | B | C | D */ answer: string; skill: string }
export interface PlacementPassage { id: string; level: number; title: string; text: string; questions: PlacementQuestion[] }

const LETTERS = ["A", "B", "C", "D"];
/** Round 6: the lowest placement passage level (−200 = "BR200L"). */
export const PLACEMENT_LOW = -200;
/** A level a placement passage may have: a multiple of 100 from PLACEMENT_LOW to RR_MAX. */
export const isPlacementLevel = (l: number): boolean => Number.isInteger(l) && l % 100 === 0 && l >= PLACEMENT_LOW && l <= RR_MAX;
let cache: { key: string; passages: PlacementPassage[] } | null = null;

/** Accepts "A".."D", "a", 0..3 or the option text itself. */
function toLetter(answer: unknown, options: string[]): string | null {
  if (typeof answer === "number" && answer >= 0 && answer < options.length) return LETTERS[answer];
  const a = String(answer ?? "").trim();
  if (/^[A-Da-d]$/.test(a)) return a.toUpperCase();
  const i = options.findIndex((o) => o.trim() === a);
  return i >= 0 ? LETTERS[i] : null;
}

/** Validates and normalises raw JSON; invalid passages are skipped (never half-used). */
export function parsePlacement(raw: unknown, taken: ReadonlySet<string> = new Set()): PlacementPassage[] {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { passages?: unknown }).passages)) ? (raw as { passages: unknown[] }).passages : [];
  const out: PlacementPassage[] = [];
  const seen = new Set<string>(taken);
  for (const p of list) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const id = String(r.id ?? "").trim(), level = Number(r.level), text = String(r.text ?? "").trim();
    if (!id || seen.has(id) || !isPlacementLevel(level) || !text) continue;
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

const mtime = (path: string): number | null => { try { return statSync(path).mtimeMs; } catch { return null; } };

/** Round 6: the passages of placement-extra.json (none when the file is missing or broken), minus ids already taken. */
function extraPassages(path: string, taken: ReadonlySet<string>): PlacementPassage[] {
  try { return parsePlacement(JSON.parse(readFileSync(path, "utf8")), taken); } catch { return []; }
}

/** The placement passages (cached): placement.json + placement-extra.json. `root` defaults to the working directory (the app root). */
export function loadPlacementPassages(root: string = process.cwd()): PlacementPassage[] {
  const path = join(root, "data", "readrise", "placement.json");
  const extraPath = join(root, "data", "readrise", "placement-extra.json");
  const m = mtime(path), xm = mtime(extraPath);
  const key = `${path}|${m}|${xm}`;
  if (cache && cache.key === key) return cache.passages;
  let base: PlacementPassage[];
  try {
    if (m === null) throw new Error("missing");
    base = parsePlacement(JSON.parse(readFileSync(path, "utf8")));
    if (base.length < 5 && root === process.cwd()) base = bundled();
  } catch {
    // the app's own file is missing on this server: the copy bundled with the code (a test's own folder: nothing)
    base = root === process.cwd() ? bundled() : [];
  }
  const passages = xm === null ? base : [...base, ...extraPassages(extraPath, new Set(base.map((p) => p.id)))];
  cache = { key, passages };
  return passages;
}
let bundledCache: PlacementPassage[] | null = null;
const bundled = (): PlacementPassage[] => (bundledCache ??= parsePlacement(bundledPlacement));
