/**
 * 📜 Certificates (Games Part 3): a printable PDF with the student's name, the achievement, the date and the school
 * name (and logo). Made AUTOMATICALLY when a student moves up a level or finishes a plan (the rewards sync, see
 * sync.ts — one per event, unique per (student, kind, refId)), or MANUALLY by a teacher for their own students.
 * Listed in the student's Reports. The PDF is drawn on download only, by the platform's report renderer
 * (src/reports/pdf.ts: Chromium loaded on the first PDF, shared, a few pages at a time — fits the 512 MB server).
 */
import { randomUUID } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassRead } from "../teacher/coordinators";
import { staffClassOf } from "./coins";
import { esc } from "../../reports/html";
import type { Branding } from "../../reports/model";
import { translate, type Lang } from "../../i18n";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => new Date(v instanceof Date ? v.getTime() : s(v)).toISOString();

export type CertKind = "LEVEL_UP" | "PLAN" | "MANUAL";
export interface CertificateRow { id: string; studentId: string; kind: CertKind; title: string; detail: string | null; date: string; byTeacher: boolean }
const toCert = (r: Row): CertificateRow => ({ id: s(r.id), studentId: s(r.studentId), kind: s(r.kind) as CertKind, title: s(r.title), detail: r.detail ? s(r.detail) : null, date: iso(r.createdAt).slice(0, 10), byTeacher: s(r.kind) === "MANUAL" });

/** Creates an automatic certificate once (false when it already exists). */
export async function autoCertificate(repo: Repo, c: { schoolId: string; studentId: string; kind: Exclude<CertKind, "MANUAL">; refId: string; title: string; detail?: string | null; now?: Date }): Promise<boolean> {
  const ref = s(c.refId).slice(0, 120);
  if ((await repo.count("Certificate", { studentId: c.studentId, kind: c.kind, refId: ref })) > 0) return false;
  try {
    await repo.create("Certificate", { schoolId: c.schoolId, studentId: c.studentId, kind: c.kind, title: c.title.slice(0, 191), detail: c.detail ? c.detail.slice(0, 300) : null, refId: ref, createdById: null, createdAt: c.now ?? new Date() });
    return true;
  } catch {
    return false;   // the unique key: made by a parallel sync
  }
}

/** A teacher's certificate for one of their OWN students (school admins: their school). */
export async function manualCertificate(repo: Repo, actor: Actor, input: { studentId: string; title: string; detail?: string | null }, now = new Date()): Promise<string> {
  await staffClassOf(repo, actor, s(input.studentId));
  const title = s(input.title).replace(/\s+/g, " ").trim();
  if (title.length < 3 || title.length > 120) throw new ValidationError("Write the achievement (3–120 characters).");
  const st = await repo.findUnique("Student", { id: input.studentId });
  if (!st) throw new ForbiddenError("Not your student.");
  const row = await repo.create("Certificate", { schoolId: s(st.schoolId), studentId: input.studentId, kind: "MANUAL", title, detail: s(input.detail).trim().slice(0, 300) || null, refId: `${now.getTime().toString(36)}-${randomUUID().slice(0, 8)}`, createdById: actor.userId, createdAt: now });
  await audit(repo, { actorId: actor.userId, action: "certificate.create", entityType: "Student", entityId: input.studentId, after: { title }, at: now });
  return s(row.id);
}

/** May this person see this student's certificates? (the student, their parent, their teachers, the school admin) */
async function assertCanSee(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) throw new ForbiddenError("Not found.");
  if (actor.role === "STUDENT") { if (actor.studentId !== studentId) throw new ForbiddenError("Not found."); return st; }
  if (actor.role === "PARENT") { if (!actor.parentChildIds?.has(studentId)) throw new ForbiddenError("Not found."); return st; }
  if (actor.role === "SUPER_ADMIN") return st;
  if (actor.role === "SCHOOL_ADMIN") { if (s(st.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found."); return st; }
  if (actor.role === "TEACHER") {
    const ms = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
    for (const m of ms) { try { await assertClassRead(repo, actor, s(m.classId)); return st; } catch { /* next */ } }
  }
  throw new ForbiddenError("Not found.");
}

/** The student's certificates, newest first (bounded). */
export async function listCertificates(repo: Repo, actor: Actor, studentId?: string): Promise<CertificateRow[]> {
  const sid = studentId ?? actor.studentId;
  if (!sid) throw new ForbiddenError();
  await assertCanSee(repo, actor, sid);
  const rows = await repo.findMany("Certificate", { studentId: sid }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 100 });
  return rows.map(toCert);
}

export interface CertificateData { cert: CertificateRow; studentName: string; schoolId: string }
/** One certificate with what it prints (access checked; unknown and forbidden look the same). */
export async function certificateFor(repo: Repo, actor: Actor, id: string): Promise<CertificateData> {
  const r = await repo.findUnique("Certificate", { id: s(id) });
  if (!r) throw new ForbiddenError("Not found.");
  const st = await assertCanSee(repo, actor, s(r.studentId));
  const u = await repo.findUnique("User", { id: st.userId });
  return { cert: toCert(r), studentName: s(u?.displayName) || "Student", schoolId: s(st.schoolId) };
}

const LEVEL_WORDS: Record<string, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };
/** The achievement line in the certificate's language (teacher-written text stays as written). */
export function achievementText(c: CertificateRow, lang: Lang): string {
  if (c.kind === "LEVEL_UP") {
    const m = c.title.match(/^Moved up to (Below|On|Above) Level/);
    if (m) return translate(lang, "Moved up to {level}", { level: translate(lang, LEVEL_WORDS[m[1].toUpperCase()]) }) + (c.detail ? ` · ${c.detail}` : "");
  }
  if (c.kind === "PLAN") return translate(lang, "Finished every part of the plan “{title}”", { title: c.title.replace(/^Finished the plan: /, "") });
  return c.title;
}

/** The certificate page (A4 landscape) as self-contained HTML: escaped text, embedded fonts and logo, no scripts. */
export function certificateHtml(d: CertificateData, branding: Branding, lang: Lang, fonts: { css: string; stack: string }): string {
  const t = (x: string, v?: Record<string, string | number>) => translate(lang, x, v);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const school = lang === "ar" && branding.nameAr ? branding.nameAr : branding.name;
  const logo = branding.logo ? `<img class="logo" alt="" src="data:${branding.logo.mime};base64,${Buffer.from(branding.logo.bytes).toString("base64")}">` : "";
  const date = new Date(d.cert.date + "T12:00:00Z").toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const medal = `<svg class="medal" viewBox="0 0 80 96" aria-hidden="true"><path d="M24 58 L14 94 L28 86 L36 96 L40 64 Z" fill="#b45309"/><path d="M56 58 L66 94 L52 86 L44 96 L40 64 Z" fill="#92400e"/><circle cx="40" cy="38" r="34" fill="#f59e0b"/><circle cx="40" cy="38" r="27" fill="#fde68a" stroke="#d97706" stroke-width="2"/><polygon points="40,20 45,33 59,33 48,41 52,55 40,47 28,55 32,41 21,33 35,33" fill="#d97706"/></svg>`;
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(t("Certificate of Achievement"))}</title><style>${fonts.css}
@page{size:A4 landscape;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:${fonts.stack};color:#1e293b;background:#fff;width:297mm;height:210mm}
.page{position:relative;width:297mm;height:210mm;padding:12mm}
.frame{height:100%;border:6px double #d97706;border-radius:14px;padding:12mm 18mm;text-align:center;background:linear-gradient(180deg,#fffbeb 0%,#fff 55%);display:flex;flex-direction:column;align-items:center}
.top{display:flex;align-items:center;justify-content:center;gap:10mm;width:100%}
.logo{height:18mm;max-width:50mm;object-fit:contain}
.school{font-size:14pt;font-weight:700;color:#0f2a4a;letter-spacing:.04em}
h1{margin:6mm 0 0;font-size:34pt;color:#0f2a4a}
.medal{width:24mm;height:28mm;margin-top:4mm}
.to{margin-top:4mm;font-size:13pt;color:#475569}
.name{margin-top:2mm;font-size:30pt;font-weight:700;color:#0f766e;unicode-bidi:isolate}
.for{margin-top:5mm;font-size:13pt;color:#475569}
.what{margin-top:2mm;font-size:19pt;font-weight:700;color:#0f2a4a;max-width:220mm;unicode-bidi:plaintext}
.foot{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-end;font-size:11pt;color:#475569}
.line{border-top:1.5px solid #94a3b8;padding-top:2mm;min-width:60mm}
@media screen and (max-width:1100px){body{width:auto;height:auto}.page{width:auto;height:auto;padding:12px}.frame{padding:20px 14px;min-height:92vh}h1{font-size:26px}.name{font-size:26px}.what{font-size:18px;max-width:100%}.to,.for{font-size:14px}.logo{height:44px}.school{font-size:14px}.foot{flex-direction:column;align-items:center;gap:14px;margin-top:28px}.line{min-width:60%}}
</style></head><body><div class="page"><div class="frame">
<div class="top">${logo}<div class="school">${esc(school)}</div></div>
<h1>${esc(t("Certificate of Achievement"))}</h1>${medal}
<div class="to">${esc(t("This certificate is proudly presented to"))}</div>
<div class="name" dir="auto">${esc(d.studentName)}</div>
<div class="for">${esc(t("for"))}</div>
<div class="what" dir="auto">${esc(achievementText(d.cert, lang))}</div>
<div class="foot"><div class="line">${esc(t("Date"))}: <span dir="ltr">${esc(date)}</span></div><div class="line">${esc(d.cert.byTeacher ? t("Teacher") : school)}</div></div>
</div></div></body></html>`;
}
