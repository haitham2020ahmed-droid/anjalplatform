/**
 * 🚀 The student's own ReadRise growth story (server-safe, no client JS): encouraging words, the level journey
 * (each step up), the streak and the skills getting stronger. Never a grade range, Below / On / Above or a tier.
 */
import type { TFn } from "@/i18n";
import type { MyGrowthStory } from "@/server/readrise/growth-report";
import { skillLabel } from "@/server/readrise/growth-words";

export function GrowthStory({ story, t }: { story: MyGrowthStory; t: TFn }) {
  const named = (keys: string[]) => keys.map((k) => t(skillLabel(k))).join(", ");
  return (
    <section aria-labelledby="story-h" data-testid="rr-growth-story" className="mt-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
      <h2 id="story-h" className="text-xl font-bold text-brand-navy">🌟 {t("My growth story")}</h2>
      <ul className="mt-3 space-y-2">
        {story.lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-slate-800">
            <span aria-hidden="true">{l.icon}</span>
            <span>{t(l.text, l.vars?.skills !== undefined ? { ...l.vars, skills: named(story.stronger) } : l.vars)}</span>
          </li>
        ))}
      </ul>
      {story.journey.length > 1 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-600">{t("My level journey")}</p>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t("My level journey")}>
            {story.journey.map((j, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-emerald-600">→</span>}
                <span className={`rounded-xl px-2.5 py-1 text-sm font-bold tabular-nums ${i === story.journey.length - 1 ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`} title={j.at.slice(0, 10)}>{j.level}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {story.strengths.length > 0 && <p className="mt-4 text-sm text-slate-700">⭐ {t("My strongest skills")}: <strong>{named(story.strengths)}</strong></p>}
    </section>
  );
}
