/**
 * 📥 Any MAP file the teacher has → the platform: the platform's template (CSV / Excel), NWEA's data export
 * (CSV: RIT, Lexile, rapid guessing, goal-area RIT ranges), NWEA's Achievement Status and Growth report (PDF:
 * RIT, percentile, Spring projection and projected growth) or NWEA's Class Profile report (PDF, Instructional
 * Areas tab: RIT, percentile, Lexile and the 3 instructional-area scores — no Spring projection, no Student ID,
 * so students are matched by name only). Students are matched by Student ID (then by name); everyone who is not
 * found is listed so nobody is missed silently.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { extract } from "../../imports/questions/extract";
import { importMapScores, type MapImportResult } from "./student-map";
import { asgLinesFromPages, asgToTable, parseAsg, pdfPages } from "./asg";
import { classProfileToTable, parseClassProfile } from "./class-profile";
import { notifyMapScores } from "./map-notify";

type ImportKind = "ASG" | "CLASS_PROFILE" | "TABLE";
export async function importMapFile(repo: Repo, actor: Actor, fileName: string, bytes: Uint8Array, year: number, opts: { createInClassId?: string } = {}, now = new Date()): Promise<MapImportResult & { kind: ImportKind; norms: string | null; classHint?: string | null }> {
  if (/\.pdf$/i.test(fileName)) {
    let pages;
    try { pages = await pdfPages(bytes); }
    catch (e) {
      // Log the real underlying error (pdfjs-dist failure, module-resolution issue, etc.) to the server logs before
      // showing the teacher the generic message — otherwise the actual cause is silently lost on every failure.
      console.error(`[MAP import] pdfPages() failed for "${fileName}" (${bytes.length} bytes):`, e);
      throw new ValidationError("This PDF could not be read. Upload NWEA's “Achievement Status and Growth” report, NWEA's “Class Profile” report (Instructional Areas tab), the NWEA data export (CSV) or the platform's template.");
    }

    const asg = parseAsg(asgLinesFromPages(pages));
    if (asg.rows.length) {
      const season = asg.season, y = asg.year;
      const term = `${season[0]}${season.slice(1).toLowerCase()} ${y}`;
      const r = await importMapScores(repo, actor, asgToTable(asg), y, now, { term: { name: term, date: new Date(Date.UTC(y, season === "FALL" ? 8 : season === "WINTER" ? 0 : 3, 15)) }, wholeFile: true, createInClassId: opts.createInClassId });
      await notifyMapScores(repo, actor, r, now);
      return { ...r, kind: "ASG", norms: asg.norms };
    }

    const cp = parseClassProfile(pages);
    if (cp.rows.length) {
      const season = cp.season, y = cp.year;
      const term = `${season[0]}${season.slice(1).toLowerCase()} ${y}`;
      const r = await importMapScores(repo, actor, classProfileToTable(cp), y, now, { term: { name: term, date: new Date(Date.UTC(y, season === "FALL" ? 8 : season === "WINTER" ? 0 : 3, 15)) }, wholeFile: true, createInClassId: opts.createInClassId });
      await notifyMapScores(repo, actor, r, now);
      const subjectLabel = cp.subject === "READING" ? "Reading" : cp.subject === "LANGUAGE_USAGE" ? "Language Usage" : null;
      return { ...r, kind: "CLASS_PROFILE", norms: null, classHint: cp.className && subjectLabel ? `${cp.className} · ${subjectLabel}` : cp.className };
    }

    throw new ValidationError("No student scores were found in this PDF. Upload NWEA's “Achievement Status and Growth” report (it has the Spring projections), NWEA's “Class Profile” report (Instructional Areas tab), the NWEA data export (CSV) or the template.");
  }
  const { table } = extract(fileName, bytes);
  const r = await importMapScores(repo, actor, table, year, now, opts);
  await notifyMapScores(repo, actor, r, now);
  return { ...r, kind: "TABLE", norms: null };
}

/** One line for the teacher: what was imported, and who was not found. */
export function importMessage(r: MapImportResult & { kind?: string; norms?: string | null; classHint?: string | null }): string {
  const parts = [`${r.term}: ${r.imported} student(s) imported${r.kind === "ASG" ? " with their Spring projection" : ""}${r.norms ? ` (${r.norms})` : ""}`];
  if (r.classHint) parts.push(`📄 from the PDF: ${r.classHint} — check this matches the class/subject you meant to import`);
  if (r.created.length) parts.push(`${r.created.length} new student(s) added`);
  if (r.plans?.plans) parts.push(`📋 ${r.plans.plans} individual MAP plan draft(s) ready (${r.plans.classes.filter((c) => c.plans).map((c) => c.name).join(", ")}) — MAP → MAP plans`);
  if (r.skipped) parts.push(`${r.skipped} row(s) without a score skipped`);
  if (r.unmatched?.length) parts.push(`⚠️ not found on the platform (check their Student ID): ${r.unmatched.slice(0, 12).map((u) => `${u.name || "?"} (${u.number})`).join(", ")}${r.unmatched.length > 12 ? ` and ${r.unmatched.length - 12} more` : ""}`);
  const errs = r.errors.filter((e) => !/not in your classes|not in the school's classes/.test(e.message));
  if (errs.length) parts.push(`${errs.length} problem(s): ${errs.slice(0, 5).map((e) => (e.row ? `row ${e.row}: ${e.message}` : e.message)).join(" · ")}`);
  return parts.join(" · ");
}
