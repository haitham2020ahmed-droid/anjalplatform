/**
 * 📜 My Certificates (student): the signed-in student's OWN certificates (listCertificates checks access on the
 * server: a student only ever sees their own), with a student-friendly title — a level-up certificate reads
 * "You moved up a level!" (students never see Below / On / Above about themselves). View = the printable page,
 * PDF = the download (GET /api/certificates/<id>).
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { listCertificates, type CertificateRow } from "../motivation/certificates";

export interface MyCertificate { id: string; kind: CertificateRow["kind"]; title: string; detail: string | null; date: string; byTeacher: boolean; viewHref: string; pdfHref: string }

/** The title a student sees (English source; the page passes it through t()). Plan and teacher titles stay as written. */
export function friendlyCertificateTitle(c: Pick<CertificateRow, "kind" | "title">): string {
  if (c.kind === "LEVEL_UP") return "You moved up a level!";
  if (c.kind === "PLAN") return c.title.replace(/^Finished the plan: /, "Finished: ");
  return c.title;
}

export async function studentCertificates(repo: Repo, actor: Actor, lang = "en"): Promise<MyCertificate[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const rows = await listCertificates(repo, actor, actor.studentId);
  return rows.map((c) => ({
    id: c.id, kind: c.kind, title: friendlyCertificateTitle(c), detail: c.kind === "LEVEL_UP" ? c.detail : null, date: c.date, byTeacher: c.byTeacher,
    viewHref: `/api/certificates/${encodeURIComponent(c.id)}?format=html&lang=${lang}`, pdfHref: `/api/certificates/${encodeURIComponent(c.id)}?lang=${lang}`,
  }));
}
