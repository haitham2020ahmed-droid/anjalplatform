import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { listNafsTests, MODE_NAME } from "@/server/nafs/tests";

const NEW: { mode: string; icon: string; title: string; text: string }[] = [
  { mode: "SIMULATION", icon: "🎯", title: "NAFS simulation", text: "20 questions, 35 minutes, 2–3 passages, the PIRLS mix. Change any number and any question." },
  { mode: "MINISTRY", icon: "📘", title: "Ministry booklet model", text: "Questions grouped by the 13 Ministry standards (3 each, 1 for S11 and S12), or a whole model booklet." },
  { mode: "AUTO", icon: "⚡", title: "Automatic", text: "Choose NAFS skills and the number of questions; the platform builds it, you change it." },
  { mode: "MANUAL", icon: "✋", title: "Manual", text: "Pick the questions one by one from the NAFS bank." },
  { mode: "AI", icon: "✨", title: "Generate new questions with AI", text: "Drafts of new questions for chosen skills, for you to review before use." },
];

/** 🇸🇦 Tests: the school's NAFS tests and the four ways to make a new one. */
export async function TestsTab({ actor, t }: { actor: Actor; t: TFn }) {
  const tests = await listNafsTests(repo, actor);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-2">{t("Every test is made from ALL the NAFS questions gathered here (platform questions, model booklets and your school's own). You set the number of questions and the time in every mode.")}</p>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {NEW.map((x) => (
          <Link key={x.mode} href={`/teacher/nafs/tests/new?mode=${x.mode}`} className="lift rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
            <p className="font-semibold text-ink"><span aria-hidden="true">{x.icon} </span>{t(x.title)}</p>
            <p className="mt-1 text-sm text-ink-2">{t(x.text)}</p>
          </Link>
        ))}
      </section>
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{t("NAFS tests")}</h2>
        {!tests.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t("No NAFS tests yet. Start with a NAFS simulation.")}</p> : (
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
