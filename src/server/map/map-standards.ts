/**
 * 📐 MAP standards (owner, 8 Nov 2026: "NWEA's Standards tab — likely proficient on each CCSS standard"):
 * NWEA's Class Profile → Standards → Student Details shows, for every student and every Common Core standard of the
 * grade, "Yes" (likely proficient) or "No", worked out from the items each student answered. NWEA lets the school
 * download it (Download Spreadsheet). The teacher uploads that file (or pastes the table) for a class, and the
 * platform's Standards report then shows, next to the skill stars, the MAP picture:
 *   - per standard: how many students are likely proficient (Yes / No / no data) and the %;
 *   - per student: Yes / No on the opened standard, with the platform's skills of that standard and Assign.
 * Stored per class in SchoolSetting (no schema change). A later file for the same class replaces the standards it
 * carries (so a Reading file and a Language Usage file can sit side by side); the other standards are kept.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { accessibleClasses } from "../teacher/assign";
import { readableClasses } from "../teacher/coordinators";
import { classMembers, studentNames } from "../insights/student-data";
import { looksLikeSameName, nameWords } from "../admin/duplicate-students";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const mapStandardsKey = (classId: string) => `map.standards.${classId}`;

/** "CCSS.ELA-Literacy.RL.5.1" / "RL.5.1" / "CCSS.ELA-LITERACY.W.5.9.a" → "RL.5.1" / "W.5.9.a" (null: not a code). */
export function standardCode(raw: string): string | null {
  const t = s(raw).trim().replace(/^CCSS\.ELA-LITERACY\./i, "").replace(/\s+/g, "");
  const m = /^(RL|RI|RF|L|W|SL)\.(K|\d{1,2})\.(\d{1,2})(?:\.([a-z]))?$/i.exec(t);
  if (!m) return null;
  return `${m[1].toUpperCase()}.${m[2].toUpperCase()}.${m[3]}${m[4] ? `.${m[4].toLowerCase()}` : ""}`;
}
/** One cell: Yes / Likely Proficient → true; No / Not Likely Proficient → false; "-", blank, No Data → null. */
export function proficientCell(raw: string): boolean | null {
  const t = s(raw).trim().toLowerCase();
  if (!t || t === "-" || t === "—" || /no\s*data|n\/a/.test(t)) return null;
  if (/^not\b|not likely|^no$|^n$|^false$|^0$|^✗|^✖|^❌/.test(t)) return false;
  if (/^yes$|^y$|^likely|^true$|^1$|^✓|^✔|^✅/.test(t)) return true;
  return null;
}

export interface ParsedRow { name: string; number: string; values: Record<string, boolean | null> }
export interface ParsedStandards { codes: string[]; rows: ParsedRow[] }

/** Reads NWEA's "Student Proficiency by Standard" table (the downloaded spreadsheet or the table pasted from the page). */
export function parseNweaStandards(table: string[][]): ParsedStandards {
  const at = table.findIndex((r) => r.filter((c) => standardCode(c)).length >= 2);
  if (at < 0) throw new ValidationError("No standards were found. Use NWEA's Class Profile → Standards → Student Details → Download Spreadsheet.");
  const head = table[at];
  const cols = head.map((h, i) => ({ i, code: standardCode(h) })).filter((c): c is { i: number; code: string } => !!c.code);
  const low = head.map((h) => s(h).trim().toLowerCase());
  const first = cols[0].i;
  let nameIx = low.findIndex((h, i) => i < first && /name/.test(h));
  if (nameIx < 0) {
    const last = low.findIndex((h, i) => i < first && /last/.test(h)), firstN = low.findIndex((h, i) => i < first && /first/.test(h));
    nameIx = last >= 0 ? last : firstN >= 0 ? firstN : 0;
  }
  const lastIx = low.findIndex((h, i) => i < first && /last/.test(h) && !/first/.test(h));
  const firstIx = low.findIndex((h, i) => i < first && /first/.test(h) && !/last/.test(h));
  const numIx = low.findIndex((h, i) => i < first && /(student\s*)?id$|number/.test(h) && !/name/.test(h));
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  for (const r of table.slice(at + 1)) {
    const name = lastIx >= 0 && firstIx >= 0 ? `${s(r[lastIx]).trim()}, ${s(r[firstIx]).trim()}` : s(r[nameIx]).trim();
    if (!name || name === "," || /^student proficiency|^percentiles? key|^more information/i.test(name)) continue;
    const values: Record<string, boolean | null> = {};
    let any = false;
    for (const c of cols) { const v = proficientCell(s(r[c.i])); values[c.code] = v; if (v !== null) any = true; }
    if (!any && !cols.some((c) => s(r[c.i]).trim())) continue;   // a footer / empty line
    const key = nameWords(name).sort().join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, number: numIx >= 0 ? s(r[numIx]).trim() : "", values });
  }
  if (!rows.length) throw new ValidationError("The file has the standards but no students.");
  return { codes: cols.map((c) => c.code), rows };
}

/** The stored MAP standards of one class. */
export interface StoredStudent { name: string; studentId: string | null; v: Record<string, 1 | 0 | null> }
export interface StoredMapStandards { importedAt: string; codes: string[]; students: StoredStudent[] }

export async function loadMapStandards(repo: Repo, schoolId: string, classId: string): Promise<StoredMapStandards | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: mapStandardsKey(classId) }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== "object" || !Array.isArray((v as StoredMapStandards).students)) return null;
  return v as StoredMapStandards;
}

/** Matches a file's student names to the class (NWEA writes "LAST, First"; small spelling differences allowed). */
export function matchNames(fileNames: string[], members: { id: string; name: string }[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const used = new Set<string>();
  const key = (n: string) => nameWords(n).sort().join(" ");
  // exact (word order ignored) first, then close spellings — one platform student per file name
  for (const n of fileNames) {
    const hit = members.filter((m) => !used.has(m.id) && key(m.name) === key(n));
    if (hit.length === 1) { out.set(n, hit[0].id); used.add(hit[0].id); }
  }
  for (const n of fileNames) {
    if (out.has(n)) continue;
    const hit = members.filter((m) => !used.has(m.id) && looksLikeSameName(m.name, n));
    if (hit.length === 1) { out.set(n, hit[0].id); used.add(hit[0].id); } else out.set(n, null);
  }
  return out;
}

export interface MapStandardsImport { students: number; matched: number; codes: number; unmatched: string[] }

/** A teacher of the class (or an admin) uploads NWEA's standards table for the class. */
export async function importMapStandards(repo: Repo, actor: Actor, classId: string, table: string[][], now = new Date()): Promise<MapStandardsImport> {
  assertCan(actor, "assignments:create");
  const klass = (await accessibleClasses(repo, actor)).find((k) => s(k.id) === s(classId));
  if (!klass) throw new ForbiddenError("You can only upload MAP standards for a class you teach.");
  const parsed = parseNweaStandards(table);
  const ids = await classMembers(repo, s(classId));
  const names = await studentNames(repo, ids);
  const members = ids.map((id) => ({ id, name: names.get(id)?.name ?? "" }));
  const match = matchNames(parsed.rows.map((r) => r.name), members);
  const old = await loadMapStandards(repo, s(klass.schoolId) || s(actor.schoolId), s(classId));
  const fileCodes = new Set(parsed.codes);
  // keep the standards this file does not carry (another subject's file); this file's standards are replaced
  const byKey = new Map<string, StoredStudent>();
  const k = (x: { studentId: string | null; name: string }) => x.studentId ?? `name:${nameWords(x.name).sort().join(" ")}`;
  for (const st of old?.students ?? []) {
    const v = Object.fromEntries(Object.entries(st.v).filter(([c]) => !fileCodes.has(c)));
    if (Object.keys(v).length) byKey.set(k(st), { ...st, v });
  }
  for (const r of parsed.rows) {
    const studentId = match.get(r.name) ?? null;
    const prev = byKey.get(k({ studentId, name: r.name }));
    const v: Record<string, 1 | 0 | null> = { ...(prev?.v ?? {}) };
    for (const c of parsed.codes) v[c] = r.values[c] === null || r.values[c] === undefined ? null : r.values[c] ? 1 : 0;
    byKey.set(k({ studentId, name: r.name }), { name: r.name, studentId, v });
  }
  const codes = [...new Set([...(old?.codes ?? []).filter((c) => !fileCodes.has(c)), ...parsed.codes])];
  const value: StoredMapStandards = { importedAt: now.toISOString(), codes, students: [...byKey.values()] };
  const schoolId = s(klass.schoolId) || s(actor.schoolId);
  await repo.upsert("SchoolSetting", { schoolId, key: mapStandardsKey(s(classId)) }, { value, updatedBy: actor.userId, updatedAt: now }, { value, updatedBy: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "map.standards.import", entityType: "Class", entityId: s(classId), after: { codes: parsed.codes.length, students: parsed.rows.length }, at: now });
  const unmatched = parsed.rows.filter((r) => !match.get(r.name)).map((r) => r.name);
  return { students: parsed.rows.length, matched: parsed.rows.length - unmatched.length, codes: parsed.codes.length, unmatched };
}

/** The platform's description of each standard code (the Standard table, any spelling of the code). */
export async function standardDescriptions(repo: Repo, codes: string[]): Promise<Map<string, string>> {
  if (!codes.length) return new Map();
  const variants = codes.flatMap((c) => [c, `CCSS.ELA-LITERACY.${c}`, `CCSS.ELA-Literacy.${c}`]);
  const rows = await repo.findMany("Standard", { framework: "CCSS_ELA", code: { in: variants } }, { select: ["code", "description"] });
  const out = new Map<string, string>();
  for (const r of rows) { const c = standardCode(s(r.code)); if (c && s(r.description).trim() && !out.has(c)) out.set(c, s(r.description).trim()); }
  return out;
}

export interface MapStdStudent { id: string | null; name: string; value: boolean | null }
export interface MapStdRow { code: string; yes: number; no: number; none: number; pct: number | null; students: MapStdStudent[] }
export interface MapStandardsView { importedAt: string; rows: MapStdRow[]; unmatched: string[]; notInFile: number }

/** The class's MAP standards, per standard (read only; any class the actor can read). */
export async function mapStandardsView(repo: Repo, actor: Actor, classId: string): Promise<MapStandardsView | null> {
  assertCan(actor, "reports:read");
  const klass = (await readableClasses(repo, actor)).find((c) => s(c.id) === s(classId));
  if (!klass) throw new ForbiddenError("Class not found.");
  const st = await loadMapStandards(repo, s(klass.schoolId) || s(actor.schoolId), s(classId));
  if (!st) return null;
  const ids = new Set(await classMembers(repo, s(classId)));
  const names = await studentNames(repo, [...ids]);
  // only students still in the class (or not matched to anyone, shown by their NWEA name)
  const people = st.students.filter((x) => !x.studentId || ids.has(x.studentId));
  const rows: MapStdRow[] = st.codes.map((code) => {
    const students = people.map((x) => ({ id: x.studentId, name: x.studentId ? names.get(x.studentId)?.name ?? x.name : x.name, value: x.v[code] === 1 ? true : x.v[code] === 0 ? false : null }));
    const yes = students.filter((x) => x.value === true).length, no = students.filter((x) => x.value === false).length;
    return { code, yes, no, none: students.length - yes - no, pct: yes + no ? Math.round((100 * yes) / (yes + no)) : null,
      students: students.sort((a, b) => Number(a.value === true) - Number(b.value === true) || Number(a.value === null) - Number(b.value === null) || a.name.localeCompare(b.name)) };
  });
  const inFile = new Set(people.map((x) => x.studentId).filter(Boolean));
  return { importedAt: st.importedAt, rows: rows.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })), unmatched: people.filter((x) => !x.studentId).map((x) => x.name), notInFile: [...ids].filter((id) => !inFile.has(id)).length };
}
