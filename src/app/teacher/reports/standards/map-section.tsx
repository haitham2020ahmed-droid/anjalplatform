import Link from "next/link";
import { AtAGlance, ReportSection } from "@/components/report-kit";
import { getT } from "@/i18n/server";
import type { MapStandardsView, MapStdRow } from "@/server/map/map-standards";
import { importMapStandardsAction } from "./actions";

const STRAND: Record<string, string> = { RL: "Reading: Literature", RI: "Reading: Informational Text", RF: "Reading: Foundational Skills", L: "Language", W: "Writing", SL: "Speaking and Listening" };
const strandOf = (code: string) => code.split(".")[0];
const pctTone = (p: number | null) => (p === null ? "text-slate-400" : p >= 70 ? "text-emerald-700" : p >= 40 ? "text-amber-700" : "text-rose-700");

/** Green (likely proficient) / red (not yet) / grey (no data) bar for one standard. */
function Bar({ r, label }: { r: MapStdRow; label: string }) {
  const total = Math.max(1, r.yes + r.no + r.none);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={label}>
      {r.yes > 0 && <span className="bg-emerald-500" style={{ width: `${(100 * r.yes) / total}%` }} />}
      {r.no > 0 && <span className="bg-rose-500" style={{ width: `${(100 * r.no) / total}%` }} />}
      {r.none > 0 && <span className="bg-slate-200" style={{ width: `${(100 * r.none) / total}%` }} />}
    </div>
  );
}

/**
 * 📐 The MAP side of the Standards report: NWEA's "likely proficient" per Common Core standard for the class
 * (uploaded from NWEA), each standard opening the students who are not yet proficient and the platform's skills of
 * that standard, with Assign and a small group.
 */
export async function MapStandardsSection({ classId, view, desc, skills, open, canUpload, canAssign }: {
  classId: string; view: MapStandardsView | null; desc: Record<string, string>; skills: Record<string, { skillId: string; name: string }[]>;
  open: string | null; canUpload: boolean; canAssign: boolean;
}) {
  const { t } = await getT();
  const href = (p: Record<string, string>) => `/teacher/reports/standards?${new URLSearchParams({ classId, source: "map", ...p })}`;
  const upload = canUpload ? (
    <form action={importMapStandardsAction} className="grid gap-3 print:hidden">
      <input type="hidden" name="classId" value={classId} />
      <ol className="list-decimal space-y-0.5 ps-5 text-sm text-slate-700">
        <li>{t("In NWEA MAP: Class Profile → choose the class → Language Arts → Reading (or Language Usage).")}</li>
        <li>{t("Open the Standards tab → View by: Student Details → Download Spreadsheet.")}</li>
        <li>{t("Upload the file here (or copy the table from the page and paste it below).")}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".xlsx,.xls,.csv" className="text-sm" />
        <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">{t("Upload")}</button>
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-brand-teal">{t("Or paste the table")}</summary>
        <textarea name="text" rows={6} className="mt-2 w-full rounded-xl border border-slate-300 p-2 font-mono text-xs" dir="ltr" placeholder="Student Name	CCSS.ELA-Literacy.RL.5.1	CCSS.ELA-Literacy.RL.5.2 …&#10;Kamel, Joury	No	Yes …" />
      </details>
      <p className="text-xs text-slate-500">{t("A new file for the class replaces the standards it carries; the others are kept (so a Reading file and a Language Usage file can both be uploaded).")}</p>
    </form>
  ) : null;

  if (!view || !view.rows.length) {
    return (
      <ReportSection title="MAP standards (NWEA)" icon="🧭" hint="NWEA works out, from each student's MAP answers, whether they are likely proficient on every Common Core standard of the grade. Upload it once per test season.">
        {upload ?? <p className="text-sm text-slate-600">{t("No MAP standards have been uploaded for this class yet.")}</p>}
      </ReportSection>
    );
  }
  const scored = view.rows.filter((r) => r.pct !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.pct ?? 0), 0) / scored.length) : null;
  const weak = [...scored].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)).slice(0, 3);
  const opened = open ? view.rows.find((r) => r.code === open) ?? null : null;
  const strands = [...new Set(view.rows.map((r) => strandOf(r.code)))];
  const label = (r: MapStdRow) => `${t("Likely proficient")}: ${r.yes}, ${t("Not yet")}: ${r.no}, ${t("No data")}: ${r.none}`;
  return (
    <>
      <AtAGlance items={[
        { icon: "📐", label: "Standards", value: view.rows.length, meaning: "from the class's MAP test" },
        { icon: "🟢", label: "Likely proficient (average)", value: avg === null ? "—" : `${avg}%`, meaning: "share of the class, over all standards", tone: avg !== null && avg >= 60 ? "good" : "neutral" },
        { icon: "🔴", label: "Under 40%", value: scored.filter((r) => (r.pct ?? 0) < 40).length, meaning: "standards most of the class still needs", tone: scored.some((r) => (r.pct ?? 0) < 40) ? "warn" : "neutral" },
        { icon: "🗓️", label: "Uploaded", value: view.importedAt.slice(0, 10), meaning: view.unmatched.length ? t("{n} name(s) not found in the class", { n: view.unmatched.length }) : "every name matched" },
      ]} />
      {weak.length > 0 && (
        <p className="mb-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-900 ring-1 ring-rose-200">
          👉 {t("Start with")}: {weak.map((r, i) => <span key={r.code}>{i ? " · " : ""}<Link prefetch={false} href={href({ std: r.code })} className="font-semibold underline" dir="ltr">{r.code}</Link> ({r.pct}%)</span>)}
        </p>
      )}
      <p className="mb-4 flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />{t("Likely proficient")}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />{t("Not yet")}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200" />{t("No data")}</span>
      </p>

      {opened && (() => {
        const notYet = opened.students.filter((x) => x.value === false && x.id);
        const sk = skills[opened.code] ?? [];
        return (
          <ReportSection title={opened.code} icon="🔎" hint={desc[opened.code] ?? undefined}>
            <div className="mb-3 flex flex-wrap items-center gap-3"><div className="w-full max-w-md"><Bar r={opened} label={label(opened)} /></div><Link prefetch={false} href={href({})} className="text-sm font-semibold text-brand-teal underline print:hidden">{t("Close")}</Link></div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="font-semibold text-brand-navy">{t("Students")}</h3>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">{opened.students.map((x, i) => (
                  <li key={`${x.id ?? x.name}-${i}`} className="flex items-center justify-between gap-2 py-1.5" data-map-std={x.value === null ? "none" : x.value ? "yes" : "no"}>
                    {x.id ? <Link prefetch={false} href={`/teacher/students/${x.id}`} className="truncate text-brand-navy hover:underline"><bdi>{x.name}</bdi></Link> : <span className="truncate text-slate-500"><bdi>{x.name}</bdi> <span className="text-xs">({t("not in the class")})</span></span>}
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${x.value === null ? "bg-slate-100 text-slate-600" : x.value ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{x.value === null ? t("No data") : x.value ? `✓ ${t("Likely proficient")}` : `✗ ${t("Not yet")}`}</span>
                  </li>
                ))}</ul>
              </div>
              <div>
                <h3 className="font-semibold text-brand-navy">{t("Practice on the platform")}</h3>
                {sk.length ? (
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">{sk.map((k) => (
                    <li key={k.skillId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <Link prefetch={false} href={`/skill/${k.skillId}`} className="font-semibold text-brand-navy hover:underline">{k.name}</Link>
                      {canAssign && <Link prefetch={false} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: k.skillId, classId })}`} className="rounded-lg bg-brand-navy px-2 py-0.5 text-xs font-semibold text-white print:hidden">{t("Assign")}</Link>}
                    </li>
                  ))}</ul>
                ) : <p className="mt-2 text-sm text-slate-600">{t("No skill of the platform is linked to this standard yet.")}</p>}
                {canAssign && notYet.length > 0 && (
                  <Link prefetch={false} href={`/teacher/intervention/groups?${new URLSearchParams({ class: classId, students: notYet.map((x) => x.id!).join(",") })}`} className="mt-3 inline-block rounded-xl bg-brand-teal px-3 py-1.5 text-sm font-semibold text-white print:hidden">👥 {t("Make a small group ({n})", { n: notYet.length })}</Link>
                )}
              </div>
            </div>
          </ReportSection>
        );
      })()}

      {strands.map((st) => (
        <ReportSection key={st} title={STRAND[st] ?? st} icon="📚">
          <ul className="divide-y divide-slate-100">{view.rows.filter((r) => strandOf(r.code) === st).map((r) => (
            <li key={r.code} className={`grid gap-2 py-2 sm:grid-cols-[8rem_1fr_14rem] sm:items-center ${opened?.code === r.code ? "bg-teal-50/60" : ""}`} data-map-standard={r.code}>
              <Link prefetch={false} href={href({ std: r.code })} className="font-semibold text-brand-navy hover:underline" dir="ltr">{r.code}</Link>
              <p className="text-sm text-slate-700" data-content lang="en">{desc[r.code] || "—"}</p>
              <div className="flex items-center gap-2">
                <Bar r={r} label={label(r)} />
                <b className={`shrink-0 text-sm tabular-nums ${pctTone(r.pct)}`}>{r.pct === null ? "—" : `${r.pct}%`}</b>
              </div>
            </li>
          ))}</ul>
        </ReportSection>
      ))}
      {view.unmatched.length > 0 && <p className="mb-3 text-xs text-slate-500">{t("Names in the NWEA file not found in this class")}: {view.unmatched.join(" · ")}</p>}
      <p className="mb-4 text-xs text-slate-500">{t("The % is the share of the students with MAP data who are likely proficient on the standard (NWEA works it out from the items each student answered).")}</p>
      {upload && <ReportSection title="Upload a newer MAP standards file" icon="⬆️">{upload}</ReportSection>}
    </>
  );
}
