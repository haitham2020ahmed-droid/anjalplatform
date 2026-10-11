"use client";
import { useState } from "react";
import type { CoachResult } from "@/server/fluency/coach";
import { useT } from "@/i18n/client";
import { ListenButton } from "../listen-button";
import { useCoachRecorder } from "./recorder";
import { MicMeter } from "./mic-meter";

/**
 * 🎧 After the result: listen to the passage twice (Slow, then Normal, the words highlighted), then "Read it again for
 * practice". The practice reading is compared with the first one, with encouraging words; it is never stored and
 * never counts (only the first reading sets the level).
 */
export function ListenAndPractice({ first, text, limit }: { first: CoachResult; text: string; limit: number }) {
  const t = useT();
  const [listened, setListened] = useState(false);
  const [practice, setPractice] = useState<CoachResult | null>(null);
  const r = useCoachRecorder({ limit, fields: () => ({ key: first.passageKey, mode: first.mode, kind: "PASSAGE", rereadOf: first.id }), onResult: setPractice });
  const imp = practice?.improvement ?? null;
  const gain = (n: number, unit = "") => (n > 0 ? `+${n}${unit}` : n < 0 ? `${n}${unit}` : t("same"));
  const card = "rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200";
  const btn = "min-h-[44px] rounded-2xl px-6 py-3 text-lg font-extrabold";
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-bold text-brand-navy">🎧 {t("Listen to the passage")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("You will hear it twice: first slowly, then at normal speed. Follow the highlighted words.")}</p>
        <ListenButton text={text} label="Listen to the passage" sequence={["slow", "normal"]} onFinish={() => setListened(true)} />
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold text-brand-navy">🔁 {t("Read it again for practice")}</h2>
        <p className="text-sm text-slate-600">{t("This reading is practice. Your first reading is the one that counts.")}</p>
        {!listened && r.stage === "ready" && !practice && <p className="mt-2 text-sm text-slate-500">{t("Tip: listen to the passage first, then read it again.")}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {r.stage === "ready" && <><MicMeter mic={r.mic} onCheck={() => void r.check()} dark={false} /><button type="button" onClick={r.start} className={`${btn} bg-brand-navy text-white hover:bg-brand-purple`}>🎙 {t("Start reading")}</button></>}
          {r.stage === "recording" && <><p className="flex items-center gap-3 text-lg font-bold text-slate-900"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />{t("Recording")} · <span className="tabular-nums">{Math.floor(r.secs / 60)}:{String(r.secs % 60).padStart(2, "0")}</span></p>{r.mic.verdict === "quiet" && <MicMeter mic={r.mic} dark={false} />}<button type="button" onClick={r.stop} className={`${btn} bg-brand-navy text-white`}>■ {t("Stop")}</button></>}
          {r.stage === "sending" && <p className="text-lg font-semibold text-slate-800">🎧 {t("The coach is listening to your reading…")}</p>}
          {r.stage === "waiting" && <p className="text-lg font-semibold text-slate-800">⏳ {t("Your result comes in about {n}s. Keep this page open.", { n: r.wait })}</p>}
          {r.stage === "error" && <><p className="text-base font-semibold text-rose-800">⚠️ {r.msg}</p><button type="button" onClick={r.reset} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300`}>{t("Try again")}</button></>}
        </div>

        {r.stage === "done" && practice && imp && (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-900">{imp.message}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase text-slate-500">{t("Words correct per minute")}</p>
                <p className="text-sm text-slate-600">{t("First reading")}: <b className="tabular-nums">{imp.first.wcpm}</b> · {t("Practice")}: <b className="tabular-nums">{practice.wcpm}</b></p>
                <p className="text-2xl font-extrabold tabular-nums text-brand-navy">{gain(imp.wcpmGain)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-xs font-semibold uppercase text-slate-500">{t("Accuracy")}</p>
                <p className="text-sm text-slate-600">{t("First reading")}: <b className="tabular-nums">{imp.first.accuracy}%</b> · {t("Practice")}: <b className="tabular-nums">{practice.accuracy}%</b></p>
                <p className="text-2xl font-extrabold tabular-nums text-brand-navy">{gain(imp.accuracyGain, "%")}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setPractice(null); r.reset(); }} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}>🔁 {t("Read it again for practice")}</button>
          </div>
        )}
      </section>
    </>
  );
}
