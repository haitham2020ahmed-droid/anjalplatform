import Link from "next/link";
import { headers } from "next/headers";
import { AccountSheet, ACCOUNTS_CSS, SignInCards, type AccountClass } from "@/components/print/accounts";
import { PrintStyles } from "@/components/print/print-kit";
import { classTeacherNames } from "@/reports/class-teachers";
import { getT } from "@/i18n/server";
import { AppShell } from "@/components/app-shell";
import { card, field, h2, label } from "@/components/admin/styles";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentCards, studentPasswordIsUsername } from "@/server/admin/student-cards";
import { setUsernamePasswordsAction, stopUsernamePasswordsAction } from "./actions";

/** 🪪 Printable sign-in cards for the school's students (the browser's "Save as PDF" makes the PDF). */
export default async function StudentCardsPage({ searchParams }: { searchParams: Promise<{ classId?: string; grade?: string; msg?: string; view?: string; cut?: string }> }) {
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
  const { t } = await getT();
  const view = q.view === "sheet" ? "sheet" : "cards";
  const cut = q.cut === "1";
  const entries = cards.map((c) => ({ ...c, password: sameAsUsername ? c.username : null }));
  // the class sheet: one page per class, with the class's teacher(s) at the top
  const idOf = new Map(classes.map((c) => [`${c.name}|${c.grade}`, c.id]));
  const teachers = view === "sheet" ? await classTeacherNames(repo, [...new Set(entries.map((e) => idOf.get(`${e.className}|${e.grade}`) ?? ""))]) : new Map<string, string>();
  const sheets: AccountClass[] = [];
  for (const e of entries) {
    let g = sheets.find((x) => x.className === e.className && x.grade === e.grade);
    if (!g) sheets.push(g = { className: e.className, grade: e.grade, teacher: teachers.get(idOf.get(`${e.className}|${e.grade}`) ?? "") ?? "", rows: [] });
    g.rows.push(e);
  }
  const link = (v: Record<string, string>) => `/admin/student-cards?${new URLSearchParams({ ...(classId ? { classId } : {}), ...(!classId && grade ? { grade: String(grade) } : {}), view, ...(cut ? { cut: "1" } : {}), ...v })}`;
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const scope = classId ? classes.find((c) => c.id === classId)!.name : grade ? `Grade ${grade}` : "all students";

  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <p><Link href="/admin/school" className="text-brand-teal hover:underline">← School</Link></p>
        <h1 className="mt-2 text-3xl font-bold text-brand-navy">Student Sign-in Cards</h1>
        <p className="mt-1 text-slate-600">Choose a class or a grade, then press <b>Print</b> and pick “Save as PDF”. Each card has a QR code that opens the sign-in page with the username filled in. {cards.length} card(s) for {scope}.</p>
        {q.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{q.msg.slice(0, 300)}</p>}

        <section className={card} aria-labelledby="which">
          <h2 id="which" className={h2}>Which students</h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <label className={label}>Class<select name="classId" defaultValue={classId} className={field}><option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} · Grade {c.grade}</option>)}</select></label>
            <label className={label}>or Grade<select name="grade" defaultValue={grade ? String(grade) : ""} className={field}><option value="">All grades</option>{grades.map((g) => <option key={g.id} value={g.level}>Grade {g.level}</option>)}</select></label>
            <input type="hidden" name="view" value={view} />
            <button className="min-h-11 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Show</button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link prefetch={false} href={link({ view: "cards" })} aria-current={view === "cards" ? "page" : undefined} className={chip(view === "cards")}>{t("Sign-in cards")}</Link>
            <Link prefetch={false} href={link({ view: "sheet" })} aria-current={view === "sheet" ? "page" : undefined} className={chip(view === "sheet")}>{t("Class sheet")}</Link>
            {view === "sheet" && <Link prefetch={false} href={link({ cut: cut ? "0" : "1" })} aria-pressed={cut} className={chip(cut)}>✂ {t("Cut lines")}</Link>}
            <span className="flex-1" />
            <PrintButton label={view === "sheet" ? t("Print the class sheet") : t("Print sign-in cards")} />
          </div>
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

      {cards.length > 0 && <p className="mt-6 mb-2 text-sm text-slate-500 print:hidden">{t("Preview: this is what prints.")}</p>}
      {cards.length > 0 && <PrintStyles extra={ACCOUNTS_CSS} />}
      {cards.length > 0 && (view === "sheet"
        ? <AccountSheet classes={sheets} school={String(school?.name ?? "")} base={base} cut={cut} t={t} />
        : <SignInCards cards={entries} school={String(school?.name ?? "")} base={base} t={t} />)}
      {cards.length === 0 && <p className="mt-6 text-slate-500">No active students here.</p>}
    </AppShell>
  );
}
