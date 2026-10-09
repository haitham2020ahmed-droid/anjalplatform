/**
 * 📥 Any MAP file the teacher has → the platform: the platform's template (CSV / Excel), NWEA's data export
 * (CSV: RIT, Lexile, rapid guessing, goal-area RIT ranges) or NWEA's Achievement Status and Growth report
 * (PDF: RIT, percentile, Spring projection and projected growth). Students are matched by Student ID (then by
 * name); everyone who is not found is listed so nobody is missed silently.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { extract } from "../../imports/questions/extract";
import { importMapScores, type MapImportResult } from "./student-map";
import { asgLinesFromPages, asgToTable, parseAsg, pdfPages } from "./asg";
import { notifyMapScores } from "./map-notify";

export async function importMapFile(repo: Repo, actor: Actor, fileName: string, bytes: Uint8Array, year: number, opts: { createInClassId?: string } = {}, now = new Date()): Promise<MapImportResult & { kind: "ASG" | "TABLE"; norms: string | null }> {
  if (/\.pdf$/i.test(fileName)) {
    let parsed;
    try { parsed = parseAsg(asgLinesFromPages(await pdfPages(bytes))); }
    catch { throw new ValidationError("This PDF could not be read. Upload NWEA's “Achievement Status and Growth” report (PDF), the NWEA data export (CSV) or the platform's template."); }
    if (!parsed.rows.length) throw new ValidationError("No student scores were found in this PDF. Upload NWEA's “Achievement Status and Growth” report (it has the Spring projections), the NWEA data export (CSV) or the template.");
    const season = parsed.season, y = parsed.year;
    const term = `${season[0]}${season.slice(1).toLowerCase()} ${y}`;
    const r = await importMapScores(repo, actor, asgToTable(parsed), y, now, { term: { name: term, date: new Date(Date.UTC(y, season === "FALL" ? 8 : season === "WINTER" ? 0 : 3, 15)) }, wholeFile: true });
    await notifyMapScores(repo, actor, r, now);
    return { ...r, kind: "ASG", norms: parsed.norms };
  }
  const { table } = extract(fileName, bytes);
  const r = await importMapScores(repo, actor, table, year, now, opts);
  await notifyMapScores(repo, actor, r, now);
  return { ...r, kind: "TABLE", norms: null };
}

/** One line for the teacher: what was imported, and who was not found. */
export function importMessage(r: MapImportResult & { kind?: string; norms?: string | null }): string {
  const parts = [`${r.term}: ${r.imported} student(s) imported${r.kind === "ASG" ? " with their Spring projection" : ""}${r.norms ? ` (${r.norms})` : ""}`];
  if (r.created.length) parts.push(`${r.created.length} new student(s) added`);
  if (r.skipped) parts.push(`${r.skipped} row(s) without a score skipped`);
  if (r.unmatched?.length) parts.push(`⚠️ not found on the platform (check their Student ID): ${r.unmatched.slice(0, 12).map((u) => `${u.name || "?"} (${u.number})`).join(", ")}${r.unmatched.length > 12 ? ` and ${r.unmatched.length - 12} more` : ""}`);
  const errs = r.errors.filter((e) => !/not in your classes|not in the school's classes/.test(e.message));
  if (errs.length) parts.push(`${errs.length} problem(s): ${errs.slice(0, 5).map((e) => (e.row ? `row ${e.row}: ${e.message}` : e.message)).join(" · ")}`);
  return parts.join(" · ");
}
