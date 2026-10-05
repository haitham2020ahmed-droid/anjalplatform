import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { card, field, h2, label } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { ADAPTIVE_LIMITS, getBranding, getEngineSettings, listAcademicYears } from "@/server/admin/settings";
import { archiveClassAction, brandingAction, createClassAction, engineSettingsAction, renameClassAction, yearAction } from "../actions";

export default async function SettingsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const school = can(actor, "settings:school");
  const engine = can(actor, "settings:engine") ? await getEngineSettings(repo, actor) : null;
  const branding = school ? await getBranding(repo, actor) : null;
  const years = school ? await listAcademicYears(repo, actor) : [];
  const current = years.find((y) => y.isCurrent);
  const gradeOf = new Map((await repo.findMany("Grade", { schoolId: actor.schoolId! })).map((g) => [String(g.id), Number(g.level)]));
  const classes = current ? (await repo.findMany("Class", { academicYearId: current.id, deletedAt: null })).map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf.get(String(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name)) : [];
  const termRows = [...(current?.terms ?? []), { name: "", start: "", end: "" }, { name: "", start: "", end: "" }].slice(0, Math.max(3, (current?.terms.length ?? 0) + 1));
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin" className="text-brand-teal hover:underline">← Administration</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Settings</h1>

      {school && (
        <section className={card}>
          <h2 className={h2}>School calendar</h2>
          <p className="text-sm text-slate-600">Terms decide the “this term” period on dashboards and reports. Saving a year with the same name replaces it.</p>
          <ActionForm action={yearAction} submit="Save calendar" className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={label}>Year name<input name="name" defaultValue={current?.name ?? ""} placeholder="2026-2027" required className={field} /></label>
              <label className={label}>Starts<input type="date" name="start" defaultValue={current?.start ?? ""} required className={field} /></label>
              <label className={label}>Ends<input type="date" name="end" defaultValue={current?.end ?? ""} required className={field} /></label>
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="isCurrent" defaultChecked />Current year</label>
            </div>
            {termRows.map((t, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-4">
                <label className={label}>Term {i + 1}<input name="termName" defaultValue={t.name} placeholder={`Term ${i + 1}`} className={field} /></label>
                <label className={label}>Starts<input type="date" name="termStart" defaultValue={t.start} className={field} /></label>
                <label className={label}>Ends<input type="date" name="termEnd" defaultValue={t.end} className={field} /></label>
              </div>
            ))}
          </ActionForm>
        </section>
      )}

      {can(actor, "classes:manage") && (
        <section className={card}>
          <h2 className={h2}>Classes {current ? `(${current.name})` : ""}</h2>
          <ul className="mt-2 space-y-2">
            {classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-end gap-3">
                <span className="w-20 text-sm text-slate-500">Grade {c.grade}</span>
                <ActionForm action={renameClassAction} submit="Rename" className="flex items-end gap-2">
                  <input type="hidden" name="classId" value={c.id} /><input name="name" defaultValue={c.name} maxLength={20} aria-label={`Name of class ${c.name}`} className="rounded-lg border border-slate-300 px-3 py-2" />
                </ActionForm>
                <ActionForm action={archiveClassAction} submit="Archive" danger className="flex items-end"><input type="hidden" name="classId" value={c.id} /></ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={createClassAction} submit="Add class" className="mt-4 flex flex-wrap items-end gap-3">
            <label className={label}>Name<input name="name" required maxLength={20} placeholder="4C" className={field} /></label>
            <label className={label}>Grade<select name="gradeLevel" className={field}>{[...new Set(gradeOf.values())].sort((a, b) => a - b).map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
          </ActionForm>
        </section>
      )}

      {branding && (
        <section className={card}>
          <h2 className={h2}>Report branding</h2>
          <p className="text-sm text-slate-600">Shown at the top of every PDF and Excel report. Logo: PNG, JPEG or SVG, up to 1 MB.</p>
          <ActionForm action={brandingAction} submit="Save branding" className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={label}>School name (English)<input value={branding.name} disabled className={field} /></label>
            <label className={label}>School name (Arabic)<input name="nameAr" defaultValue={branding.nameAr ?? ""} dir="rtl" lang="ar" maxLength={120} placeholder="مدارس الأنجال الأهلية" className={field} /></label>
            <label className={label}>Logo {branding.logoUrl ? <span className="text-slate-500">(current: {branding.logoUrl})</span> : null}<input type="file" name="logo" accept="image/png,image/jpeg,image/svg+xml" className="mt-1 block" /></label>
            {branding.logoUrl && <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="removeLogo" value="true" />Remove the logo</label>}
          </ActionForm>
        </section>
      )}

      {engine && (
        <section className={card}>
          <h2 className={h2}>Adaptive engine</h2>
          <p className="text-sm text-slate-600">Change these only with care: they affect every student&apos;s practice. Values outside the safe range are refused. Empty fields keep the default.</p>
          <ActionForm action={engineSettingsAction} submit="Save engine settings" className="mt-3 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(ADAPTIVE_LIMITS).map(([k, lim]) => (
                <label key={k} className={label}>{lim.label}
                  <input name={`a.${k}`} type="number" step={lim.int ? 1 : "any"} min={lim.min} max={lim.max} defaultValue={String(engine.adaptive[k as keyof typeof engine.adaptive])} className={field} />
                  <span className="text-xs text-slate-500">{lim.min}–{lim.max}</span>
                </label>
              ))}
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-5">
              <legend className="font-medium text-brand-navy">Mastery bands (score needed, 0–100, increasing)</legend>
              {(["developing", "approaching", "proficient", "mastered"] as const).map((b) => (
                <label key={b} className={label}>{b[0].toUpperCase() + b.slice(1)}<input name={`m.bands.${b}`} type="number" min={0} max={100} defaultValue={engine.mastery.bands[b]} className={field} /></label>
              ))}
              <input type="hidden" name="m.bands.beginning" value={engine.mastery.bands.beginning} />
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={label}>Answers needed for Proficient<input name="m.minAttemptsForProficient" type="number" min={1} max={50} defaultValue={engine.mastery.minAttemptsForProficient} className={field} /></label>
              <label className={label}>Answers needed for Mastered<input name="m.minAttemptsForMastered" type="number" min={1} max={100} defaultValue={engine.mastery.minAttemptsForMastered} className={field} /></label>
            </div>
          </ActionForm>
          <ActionForm action={engineSettingsAction} submit="Restore all defaults" danger className="mt-3"><input type="hidden" name="reset" value="true" /></ActionForm>
        </section>
      )}
    </AppShell>
  );
}
