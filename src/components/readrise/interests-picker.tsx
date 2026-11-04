"use client";
import { useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { setInterestsAction } from "@/app/student/readrise/interests-actions";

const MAX = 3;

/**
 * ❤️ ReadRise: "Pick 3 topics you like" — topic chips (up to 3) and Save. The ReadRise page shows it when the student
 * has no topics yet, and behind a small "Change my topics" link. The recommendations then include "You like" articles.
 */
export function InterestsPicker({ topics, chosen }: { topics: string[]; chosen: string[] }) {
  const t = useT();
  const [picked, setPicked] = useState<string[]>(() => chosen.filter((x) => topics.includes(x)).slice(0, MAX));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (topic: string) => {
    setMsg(null);
    setPicked((p) => (p.includes(topic) ? p.filter((x) => x !== topic) : p.length >= MAX ? p : [...p, topic]));
  };
  const save = () => start(async () => {
    const fd = new FormData();
    for (const x of picked) fd.append("topic", x);
    const r = await setInterestsAction(fd);
    setMsg(r.ok ? { ok: true, text: t("Saved! Your recommendations now include topics you like.") } : { ok: false, text: t(r.error) });
  });
  if (!topics.length) return null;
  return (
    <section data-testid="rr-interests" aria-labelledby="rr-interests-h" className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="rr-interests-h" className="text-lg font-bold text-brand-navy">❤️ {t("Pick 3 topics you like")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("We will suggest articles about them. You can change them any time.")}</p>
      <div role="group" aria-label={t("Topics")} className="mt-3 flex flex-wrap gap-2">
        {topics.map((topic) => {
          const on = picked.includes(topic);
          const full = !on && picked.length >= MAX;
          return (
            <button key={topic} type="button" aria-pressed={on} disabled={full || pending} onClick={() => toggle(topic)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"} ${full ? "opacity-50" : ""}`}>
              {on ? "✓ " : ""}{t(topic)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !picked.length}
          className="rounded-full bg-brand-teal px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? t("Saving…") : t("Save")}
        </button>
        <span className="text-xs text-slate-500" aria-live="polite">{t("{n} of 3 chosen", { n: picked.length })}</span>
        {msg && <span role="status" className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}
