"use client";
/** 🏁 A saved Live Challenge's results (Reports): top players, class score by skill, each student, Reteach. */
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { ChallengeResultsView } from "@/server/game/live-challenge";
import { BTN_PRIMARY } from "@/components/ui-kit/tokens";
import { StudentTable } from "./live-host";
import { AtAGlance, Callout, ReportSection, SimpleBar, toneOfPct } from "@/components/report-kit";
import { reteachChallengeAction } from "@/app/games/live-actions";

export function ChallengeResults({ data, canReteach }: { data: ChallengeResultsView; canReteach: boolean }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = data.summary.results;
  const done = !!data.summary.reteachAt;
  const run = async () => {
    setBusy(true);
    const x = await reteachChallengeAction(data.id);
    setBusy(false);
    setMsg(x.error ?? t("Reteach added {n} skills to the My Work of {s} students.", { n: x.assigned ?? 0, s: x.students ?? 0 }));
  };
  const right = r.skills.reduce((n, k) => n + k.correct, 0), all = r.skills.reduce((n, k) => n + k.total, 0);
  const acc = all ? Math.round((100 * right) / all) : null;
  const low = r.skills.filter((k) => k.low);
  return (
    <div className="space-y-5">
      <AtAGlance items={[
        { icon: "🙋", label: "Players", value: r.students.length },
        { icon: "🎯", label: "Correct", value: acc === null ? "—" : `${acc}%`, meaning: `${right} / ${all}`, tone: toneOfPct(acc, [80, 70]) },
        { icon: "🔁", label: "Reteach", value: low.length, meaning: "Reteach adds every skill under 70% to that student's My Work.", tone: low.length ? "bad" : "good" },
      ]} />
      <Callout kind="next" items={[
        ...low.map((k) => <><b dir="ltr">{k.skillName}</b> · <span dir="ltr">{k.pct === null ? "—" : `${k.pct}%`}</span></>),
      ]}>{!low.length ? t("Great job!") : null}</Callout>
      <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">{t("Top players")}</h2>
        <ol className="mt-3 flex flex-wrap gap-3">{r.top.map((p, i) => <li key={p.name + i} className="rounded-2xl bg-slate-50 px-4 py-2 font-semibold ring-1 ring-slate-200"><span aria-hidden="true">{["🥇", "🥈", "🥉"][i]} </span>{p.name} · <span dir="ltr">{p.points}</span></li>)}</ol>
      </section>
      <ReportSection title="Class score by skill" icon="🧩">
        <SimpleBar className="mb-4" items={r.skills.map((k) => ({ label: <bdi dir="ltr">{k.skillName}</bdi>, value: k.pct, display: `${k.pct === null ? "—" : `${k.pct}%`} (${k.correct}/${k.total})`, band: k.pct === null ? null : k.low ? "LOW" : "GOOD" }))} />
        <ul className="grid gap-2 sm:grid-cols-2">
          {r.skills.map((k) => (
            <li key={k.skillId} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ring-1 ${k.low ? "bg-orange-50 ring-orange-200" : "bg-emerald-50 ring-emerald-200"}`}>
              <bdi dir="ltr" className="min-w-0 truncate font-semibold text-brand-navy">{k.skillName}</bdi>
              <span className={`font-semibold ${k.low ? "text-orange-700" : "text-emerald-700"}`} dir="ltr">{k.pct === null ? "—" : `${k.pct}%`} ({k.correct}/{k.total})</span>
            </li>
          ))}
        </ul>
        {canReteach && (
          <div className="mt-4 print:hidden">
            <button type="button" onClick={run} disabled={busy || !!msg} className={BTN_PRIMARY}>🔁 {t("Reteach")}</button>
            <p className="mt-2 text-sm text-slate-600">{done ? t("Reteach was already used for this game.") : t("Reteach adds every skill under 70% to that student's My Work.")}</p>
            {msg && <p role="status" className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-900 ring-1 ring-emerald-200">{msg}</p>}
          </div>
        )}
      </ReportSection>
      <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-brand-navy">{t("Each student's score by skill")}</h2>
        <StudentTable results={r} />
      </section>
    </div>
  );
}
