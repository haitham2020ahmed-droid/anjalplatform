/**
 * 👪 The weekly family report as a PDF (English or Arabic): one student, or a whole class in ONE file with a page per
 * student — for the teacher to send by WhatsApp; the student can download their own. Same HTML as the screen
 * (src/reports/family-week-html.ts), rendered by the shared Chromium (Arabic shaping and right-to-left are correct).
 * Rate-limited and audited like every report download.
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { consumeRateLimit } from "../auth/rate-limit";
import { loadFonts } from "../../reports/fonts";
import { familyWeekDocument } from "../../reports/family-week-html";
import type { ReportDoc } from "../../reports/model";
import { makeT, type Lang } from "../../i18n";
import { RateLimitedError, REPORT_RATE, loadBranding, type ReportDeps } from "./service";
import { familyWeek, familyWeeks, type FamilyWeek } from "./family-week";

const ascii = (v: string) => v.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "student";

export async function exportFamilyWeek(deps: ReportDeps, actor: Actor, req: { studentId?: string | null; classId?: string | null; lang: Lang }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  let items: FamilyWeek[];
  let stem: string;
  if (req.studentId) {
    const w = await familyWeek(repo, actor, req.studentId, now);
    items = [w];
    stem = `family-week_${ascii(w.name)}_${w.week}`;
  } else if (req.classId) {
    if (actor.role === "STUDENT") throw new ForbiddenError();
    const b = await familyWeeks(repo, actor, req.classId, now);
    if (!b.items.length) throw new ValidationError("No students in this class yet.");
    items = b.items;
    stem = `family-week_class-${ascii(b.className)}_${b.week}`;
  } else throw new ValidationError("Choose a class or a student.");
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  if (!deps.pdf) throw new Error("PDF rendering is not configured.");
  const t = makeT(req.lang);
  const fonts = loadFonts(deps.fontDir);
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  // the footer (page n of m) needs a document description; the content itself is the family page
  const doc: ReportDoc = { kind: "student", locale: req.lang, title: t("For my family: this week"), subtitle: "", branding, meta: [], sections: [], primaryTable: "", fileStem: stem, generatedAt: now, generatedBy: "", audience: "family" };
  const bytes = await deps.pdf.render(familyWeekDocument(items, t, req.lang, fonts), doc, fonts.stack);
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: "FamilyWeek", entityId: req.studentId ?? req.classId ?? "", after: { kind: "family-week", lang: req.lang, students: items.length, week: items[0]?.week ?? null, bytes: bytes.length }, at: now });
  return { bytes, contentType: "application/pdf", filename: `${stem}${req.lang === "ar" ? "_ar" : ""}.pdf` };
}
