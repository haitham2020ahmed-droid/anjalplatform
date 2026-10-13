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
import { certificateDocument } from "../../components/print/certificate";
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

/** The achievement line in the certificate's language (teacher-written text stays as written). */
export function achievementText(c: CertificateRow, lang: Lang): string {
  if (c.kind === "LEVEL_UP") {
    // students never read Below / On / Above about themselves: the certificate says "moved up to the next level"
    if (/^Moved up to ((Below|On|Above) Level|Approaching|Meeting|Exceeding)\b/.test(c.title)) return translate(lang, "Moved up to the next level") + (c.detail ? ` · ${c.detail}` : "");
  }
  if (c.kind === "PLAN") return translate(lang, "Finished every part of the plan “{title}”", { title: c.title.replace(/^Finished the plan: /, "") });
  return c.title;
}

/** The certificate page (A4 landscape) as self-contained HTML: escaped text, embedded fonts and logo, no scripts (print kit design). */
export function certificateHtml(d: CertificateData, branding: Branding, lang: Lang, fonts: { css: string; stack: string }): string {
  const t = (x: string, v?: Record<string, string | number>) => translate(lang, x, v);
  const school = lang === "ar" && branding.nameAr ? branding.nameAr : branding.name;
  const date = new Date(d.cert.date + "T12:00:00Z").toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return certificateDocument({
    lang, title: t("Certificate of Achievement"), presented: t("This certificate is proudly presented to"), forWord: t("for"),
    studentName: d.studentName, achievement: achievementText(d.cert, lang), date, dateLabel: t("Date"), signLabel: t("Teacher's signature"), school,
    logo: branding.logo ? { mime: branding.logo.mime, base64: Buffer.from(branding.logo.bytes).toString("base64") } : null,
  }, fonts);
}
