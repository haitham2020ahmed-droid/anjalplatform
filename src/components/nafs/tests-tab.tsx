import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { listNafsTests, MODE_NAME } from "@/server/nafs/tests";
import { builderHref } from "@/server/nafs/center";
import { STARTS } from "./builder-starts";

/**
 * 🇸🇦 Tests: ONE way to make a NAFS test — the builder, started from a model booklet, all 13 standards, or standards /
 * skills the teacher chooses (then the same options and the same question list for every start) — and the school's
 * NAFS tests. Bubble sheets and typed answers live under Marking; results under Reports.
 */
export async function TestsTab({ actor, t }: { actor: Actor; t: TFn }) {
  const tests = await listNafsTests(repo, actor);
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-2 ring-teal-200" aria-labelledby="new-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="new-h" className="text-lg font-semibold text-ink">📝 {t("New NAFS test")}</h2>
          <p className="text-sm text-ink-2">{t("Start from one of these; then set the questions, the time, the difficulty and test or practice.")}</p>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {STARTS.map((x) => (
            <Link key={x.key} href={builderHref({ start: x.key })} className="lift rounded-2xl bg-surface-2 p-4 ring-1 ring-line hover:ring-teal-300">
              <p className="font-semibold text-ink"><span aria-hidden="true">{x.icon} </span>{t(x.title)}</p>
              <p className="mt-1 text-sm text-ink-2">{t(x.text)}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{t("NAFS tests")}</h2>
        {!tests.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t("No NAFS tests yet. Start with a model booklet or all 13 standards.")}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {tests.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{x.title} <span className="ms-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-900 ring-1 ring-teal-200">{t(MODE_NAME[x.mode])}</span></p>
                  <p className="text-sm text-muted">{t("{n} questions", { n: x.questions })}{x.minutes ? ` · ${t("{n} minutes", { n: x.minutes })}` : ""} · {x.author} · {new Date(x.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{x.results ? ` · ${t("{n} result(s)", { n: x.results })}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/teacher/nafs/tests/${x.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">{t("Open")}</Link>
                  {x.results > 0 && <Link href={`/teacher/nafs?tab=reports&test=${x.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line">{t("Reports")}</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
