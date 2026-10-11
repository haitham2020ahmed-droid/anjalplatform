import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { BODY_MAX, composeOptions, listAdminMessages, SUBJECT_MAX } from "@/server/messages/admin-messages";
import { mailFrom } from "@/server/mail/mailer";
import { sendMessageAction } from "./actions";

export const metadata = { title: "Messages to Teachers" };
export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** ✉️ The admin writes to all teachers, a grade's teachers or chosen teachers; it arrives on the platform and by email. */
export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "teachers:manage" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const o = await composeOptions(repo, actor);
  const history = await listAdminMessages(repo, actor);
  const from = mailFrom();
  const box = "rounded-xl border border-slate-300 px-3 py-2";
  const audienceText = (a: { kind: string; grades?: number[]; userIds?: string[] }) =>
    a.kind === "GRADE" ? `Grade ${(a.grades ?? []).join(", ")}` : a.kind === "SELECTED" ? `${(a.userIds ?? []).length} chosen` : "All teachers";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="✉️" title="Messages to Teachers" subtitle="Write to every teacher, the teachers of a grade, or chosen teachers. The message arrives in their platform inbox (with a bell notification) and by email." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <p className={`mb-5 rounded-2xl px-4 py-3 text-sm ring-1 ${o.emailOn ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
        {o.emailOn
          ? <>📧 Email is <b>ON</b>{from ? <> — sent from <b>{from}</b></> : null}. Teachers without an email address on their account get the message on the platform only.</>
          : <>📧 Email is <b>OFF</b> — messages arrive on the platform only. To turn it on, set SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS and MAIL_FROM on the server (see “Email (SMTP)” in docs/DEPLOYMENT.md).</>}
      </p>

      <Section title="New Message" icon="📝" className="mb-6">
        {o.teachers.length === 0 ? <p className="text-slate-600">There are no active teachers in your school yet.</p> : (
          <form action={sendMessageAction} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-700">Send to</legend>
              <label className="flex items-center gap-2"><input type="radio" name="audience" value="ALL" defaultChecked /> All teachers ({o.teachers.length})</label>
              <div>
                <label className="flex items-center gap-2"><input type="radio" name="audience" value="GRADE" /> Teachers of a grade</label>
                <div className="ms-6 mt-1 flex flex-wrap gap-3 text-sm">
                  {o.grades.map((g) => <label key={g} className="flex items-center gap-1"><input type="checkbox" name="grade" value={g} /> Grade {g} <span className="text-slate-500">({o.teachers.filter((t) => t.grades.includes(g)).length})</span></label>)}
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2"><input type="radio" name="audience" value="SELECTED" /> Chosen teachers</label>
                <div className="ms-6 mt-1 grid max-h-64 gap-1 overflow-y-auto text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {o.teachers.map((t) => (
                    <label key={t.userId} className="flex items-center gap-2">
                      <input type="checkbox" name="teacher" value={t.userId} />
                      <span>{t.name}{t.grades.length ? <span className="text-slate-500"> · G{t.grades.join(", ")}</span> : null}{!t.hasEmail && <span className="text-slate-400" title="No email address on this account"> · no email</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            </fieldset>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Subject<input name="subject" required maxLength={SUBJECT_MAX} className={box} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Message<textarea name="body" required maxLength={BODY_MAX} rows={8} className={box} /></label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Report to open (optional)
              <select name="report" defaultValue="" className={`${box} max-w-md`}>
                <option value="">— none —</option>
                {o.reports.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </label>
            <button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">✉️ Send</button>
          </form>
        )}
      </Section>

      <Section title="Sent Messages" icon="📬">
        {history.length === 0 ? <p className="text-slate-600">No messages yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-start text-slate-500"><th className="py-2 text-start">Date</th><th className="text-start">Subject</th><th className="text-start">To</th><th className="text-end">Recipients</th><th className="text-end">Emailed</th><th className="text-end">Failed</th><th className="text-end">Read</th></tr></thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap py-2 pe-3">{fmt(m.createdAt)}</td>
                    <td className="pe-3">{m.subject}{m.report && <span className="text-slate-500"> · 📊 {m.report}</span>}</td>
                    <td className="whitespace-nowrap pe-3 text-slate-600">{audienceText(m.audience)}</td>
                    <td className="text-end">{m.recipients}</td>
                    <td className="text-end">{m.emailOff === m.recipients ? <span className="text-slate-400">off</span> : <>{m.emailed}{m.pending ? <span className="text-slate-400"> (+{m.pending} sending)</span> : null}</>}</td>
                    <td className={`text-end ${m.emailFailed ? "font-bold text-rose-700" : ""}`}>{m.emailFailed}</td>
                    <td className="text-end">{m.read} / {m.recipients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </AppShell>
  );
}
