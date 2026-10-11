import Link from "next/link";
import { headers } from "next/headers";
import { qrPath } from "@/lib/qr";
import { AppShell } from "@/components/app-shell";
import { card, field, h2, label } from "@/components/admin/styles";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentCards, studentPasswordIsUsername } from "@/server/admin/student-cards";
import { setUsernamePasswordsAction, stopUsernamePasswordsAction } from "./actions";

/** 🪪 Printable sign-in cards for the school's students (the browser's "Save as PDF" makes the PDF). */
export default async function StudentCardsPage({ searchParams }: { searchParams: Promise<{ classId?: string; grade?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const me = (await getActor())!.user;
  const q = await searchParams;
  const schoolId = actor.schoolId!;
  const school = await repo.findUnique("School", { id: schoolId });
  const grades = (await repo.findMany("Grade", { schoolId })).map((g) => ({ id: String(g.id), level: Number(g.level) })).sort((a, b) => a.level - b.level);
  const levelOf = new Map(grades.map((g) => [g.id, g.level]));
  const classes = (await repo.findMany("Class", { schoolId, deletedAt: null })).map((c) => ({ id: String(c.id), name: String(c.name), grade: levelOf.get(String(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const classId = classes.some((c) => c.id === q.classId) ? q.classId! : "";
  const grade = grades.some((g) => String(g.level) === q.grade) ? Number(q.grade) : null;
  const cards = await studentCards(repo, actor, { classId: classId || null, grade: classId ? null : grade });
  const sameAsUsername = await studentPasswordIsUsername(repo, schoolId);
  const allCount = classId || grade ? (await studentCards(repo, actor)).length : cards.length;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = (process.env.APP_URL ?? `${proto}://${host}`).replace(/\/$/, "");
  const site = base.replace(/^https?:\/\//, "");
  const scope = classId ? classes.find((c) => c.id === classId)!.name : grade ? `Grade ${grade}` : "all students";

  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <p><Link href="/admin/users" className="text-brand-teal hover:underline">← Users</Link></p>
        <h1 className="mt-2 text-3xl font-bold text-brand-navy">Student Sign-in Cards</h1>
        <p className="mt-1 text-slate-600">Choose a class or a grade, then press <b>Download PDF / Print</b> and pick “Save as PDF”. Each card has a QR code that opens the sign-in page with the username filled in. {cards.length} card(s) for {scope}.</p>
        {q.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{q.msg.slice(0, 300)}</p>}

        <section className={card} aria-labelledby="which">
          <h2 id="which" className={h2}>Which students</h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <label className={label}>Class<select name="classId" defaultValue={classId} className={field}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} · Grade {c.grade}</option>)}</select></label>
            <label className={label}>or Grade<select name="grade" defaultValue={grade ? String(grade) : ""} className={field}><option value="">All grades</option>{grades.map((g) => <option key={g.id} value={g.level}>Grade {g.level}</option>)}</select></label>
            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Show cards</button>
            <PrintButton />
          </form>
        </section>

        <section className={card} aria-labelledby="pw">
          <h2 id="pw" className={h2}>Password = username</h2>
          <p className="mt-1 text-sm text-slate-600">
            {sameAsUsername ? "On: every student signs in with their username as the password (also new students and after a reset)." : "Off: students have their own passwords."} Each student’s password becomes exactly their username, so the card is easy to remember. Anyone who knows a username can sign in to that account, so keep the cards with the teacher.
          </p>
          <form action={setUsernamePasswordsAction} className="mt-3 flex flex-wrap items-center gap-4">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="grade" value={!classId && grade ? String(grade) : ""} />
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required />Set the password of all {allCount} student(s) of the school to their username (also students added later, and after a password reset)</label>
            <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">Set passwords</button>
          </form>
          {sameAsUsername && (
            <form action={stopUsernamePasswordsAction} className="mt-2">
              <input type="hidden" name="classId" value={classId} />
              <button className="text-sm text-brand-teal hover:underline">Turn off (new students and resets get a temporary password again)</button>
            </form>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:mt-0 print:grid-cols-2 print:gap-2">
        {cards.map((c) => (
          <div key={c.userId} className="flex break-inside-avoid gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-sm print:rounded-lg print:p-3">
            {(() => { const qr = qrPath(`${base}/login?u=${encodeURIComponent(c.username)}`); return <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-24 w-24 shrink-0" shapeRendering="crispEdges" role="img" aria-label={`QR code to sign in as ${c.username}`}><rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" /></svg>; })()}
            <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">{String(school?.name ?? "")}</p>
            <p className="mt-1 text-base font-bold text-brand-navy" dir="auto"><bdi>{c.name}</bdi></p>
            <p className="text-slate-500">{c.className} · Grade {c.grade}{c.number ? ` · No. ${c.number}` : ""}</p>
            <p className="mt-2">Username: <b className="break-all font-mono">{c.username}</b></p>
            <p>Password: <b className="break-all font-mono">{sameAsUsername ? c.username : "— ask your teacher"}</b></p>
            <p className="mt-1 text-xs text-slate-500">Scan the code, or sign in at {site}</p>
            </div>
          </div>
        ))}
        {cards.length === 0 && <p className="text-slate-500">No active students here.</p>}
      </div>
    </AppShell>
  );
}
