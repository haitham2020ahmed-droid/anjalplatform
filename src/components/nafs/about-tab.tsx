import type { TFn } from "@/i18n";
import { MOE_AREAS, MOE_BOOKLET_MODEL, MOE_CITATION, MOE_GOALS, MOE_OPTION_STYLES, MOE_STANDARDS, MOE_TARGETS, NAFS_DOMAINS, NAFS_FACTS, NAFS_SAMPLE, NAFS_SKILLS, NAFS_SOURCES, PROCESS_TARGET, PROCESSES, PROCESS_NAME, SKILL_BY_CODE } from "@/server/nafs/framework";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line";

/**
 * 🇸🇦 About NAFS: the Ministry of Education guide first (3 content areas, the 13 standards, the booklet model, the official
 * option styles, goals and target grades), then the researched facts (format, timing, skills, PIRLS %), the sample item
 * and the sources.
 */
export function AboutTab({ t }: { t: TFn }) {
  return (
    <div className="grid gap-4">
      <section className={CARD} aria-labelledby="moe-h">
        <h2 id="moe-h" className="text-lg font-semibold text-ink">{t("The Ministry guide: Grade 6 reading")}</h2>
        <p className="text-sm text-muted">{t("Source")}: {t(MOE_CITATION)}. {t("Adapted for international English Grade 6 reading.")}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {MOE_AREAS.map((a) => (
            <div key={a.code} className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
              <p className="font-semibold text-ink">{a.n}. {t(a.name)}</p>
              <p className="mt-1 text-sm text-ink-2">{t(a.about)}</p>
              <p className="mt-2 text-xs text-muted">{MOE_STANDARDS.filter((x) => x.area === a.code).map((x) => x.short).join(" · ")}</p>
            </div>
          ))}
        </div>
        <h3 className="mt-4 font-semibold text-ink">{t("The 13 reading standards")}</h3>
        <ol className="mt-2 grid gap-1.5">
          {MOE_STANDARDS.map((x) => (
            <li key={x.code} className="grid gap-1 rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-line sm:grid-cols-[3.5rem_1fr_auto]">
              <b className="font-mono text-ink" dir="ltr">{x.short}</b>
              <span className="text-ink">{t(x.text)}<span className="block text-xs text-muted" lang="en" dir="ltr">{x.samples.join(" · ")}</span></span>
              <span className="text-xs text-ink-2">{t("{n} per text", { n: x.perBooklet })} · {x.nafs.map((c) => t(SKILL_BY_CODE.get(c)?.name ?? c)).join(", ")} · {x.pirls.join("/")}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
            <p className="font-semibold text-ink">{t("The booklet model")}</p>
            <ul className="mt-1 grid gap-1 text-sm text-ink-2">{MOE_BOOKLET_MODEL.map((l) => <li key={l}>• {t(l)}</li>)}</ul>
            <p className="mt-2 text-sm text-ink-2">{t("Official option styles")}: <span lang="en" dir="ltr">{MOE_OPTION_STYLES.map((o) => `“${o}”`).join(" · ")}</span></p>
          </div>
          <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
            <p className="font-semibold text-ink">{t("Goals of NAFS")}</p>
            <ul className="mt-1 grid gap-1 text-sm text-ink-2">{MOE_GOALS.map((l) => <li key={l}>• {t(l)}</li>)}</ul>
          </div>
          <div className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
            <p className="font-semibold text-ink">{t("Target grades")}</p>
            <ul className="mt-1 grid gap-1 text-sm text-ink-2">{MOE_TARGETS.map((l) => <li key={l}>• {t(l)}</li>)}</ul>
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {NAFS_FACTS.map((f) => (
          <section key={f.title} className={CARD}>
            <h2 className="text-lg font-semibold text-ink">{t(f.title)}</h2>
            <ul className="mt-2 grid gap-1.5 text-sm text-ink-2">{f.lines.map((l) => <li key={l} className="flex gap-2"><span aria-hidden="true" className="text-teal-ink">•</span><span>{t(l)}</span></li>)}</ul>
          </section>
        ))}
      </div>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("The skills NAFS reading measures")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {NAFS_DOMAINS.map((d) => (
            <div key={d.code} className="rounded-xl bg-surface-2 p-4 ring-1 ring-line">
              <p className="font-semibold text-ink">{d.n}. {t(d.name)}</p>
              <p className="text-sm text-muted">{t(d.about)}</p>
              <ul className="mt-2 grid gap-1 text-sm text-ink-2">
                {NAFS_SKILLS.filter((k) => k.domain === d.code).map((k) => <li key={k.code}><b className="text-ink">{t(k.name)}</b> — {t(k.about)}{d.code === "PIRLS" ? ` (${PROCESS_TARGET[k.process]}%)` : ""}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("PIRLS blueprint used for simulations")}</h2>
          <ul className="mt-2 grid gap-2">
            {PROCESSES.map((p) => (
              <li key={p}>
                <div className="flex justify-between text-sm text-ink-2"><span><b className="text-ink">{p}</b> {t(PROCESS_NAME[p])}</span><span className="tabular-nums">{PROCESS_TARGET[p]}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full rounded-full bg-teal-500" style={{ width: `${PROCESS_TARGET[p] * 3}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">{t("Reading purposes: about half literary experience, half acquiring and using information.")}</p>
        </section>
        <section className={CARD}>
          <h2 className="text-lg font-semibold text-ink">{t("Sample official-style item")}</h2>
          <p className="mt-2 text-ink" lang="en" dir="ltr">{NAFS_SAMPLE.stem}</p>
          <ol className="mt-2 grid grid-cols-2 gap-1.5 text-sm" lang="en" dir="ltr">
            {NAFS_SAMPLE.options.map((o, i) => <li key={o} className={`rounded-lg px-3 py-1.5 ring-1 ${i === NAFS_SAMPLE.correct ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-surface-2 text-ink-2 ring-line"}`}><b>{"ABCD"[i]}.</b> {o}</li>)}
          </ol>
        </section>
      </div>
      <section className={CARD}>
        <h2 className="text-lg font-semibold text-ink">{t("Sources")}</h2>
        <ul className="mt-2 grid gap-1 text-sm">{NAFS_SOURCES.map((x) => <li key={x.href}><a href={x.href} target="_blank" rel="noreferrer" className="font-semibold text-teal-ink underline">{x.label}</a></li>)}</ul>
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t("Check nafs.etec.gov.sa each year for updates.")}</p>
      </section>
    </div>
  );
}
