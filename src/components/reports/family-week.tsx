/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { FamilyWeek } from "@/server/reports/family-week";
import type { Lang, TFn } from "@/i18n";
import { FAMILY_WEEK_CSS } from "@/reports/family-week-html";

/**
 * 👪 One student's weekly family page on screen — the same layout, classes and words as the PDF
 * (src/reports/family-week-html.ts familyWeekArticle), so what the family sees on the phone is what prints.
 * Server component; English content (titles, names) is isolated in Arabic text.
 */
export function FamilyWeekStyles() {
  return <style>{FAMILY_WEEK_CSS}</style>;
}

function dayOf(d: string, lang: Lang): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function FamilyWeekPage({ w, t, lang }: { w: FamilyWeek; t: TFn; lang: Lang }) {
  const list = (items: string[], empty: string) => (items.length ? <ul>{items.map((x, i) => <li key={i}><bdi>{x}</bdi></li>)}</ul> : <p className="fw-none">{t(empty)}</p>);
  const tiles: [number, string][] = [[w.tasks.length, "Tasks finished"], [w.minutes, "Minutes of learning"], [w.articles.length, "ReadRise articles"], [w.lessons.length, "Lessons"]];
  return (
    <article className="fw-page" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} data-testid="family-week">
      <header className="fw-head">
        <div><h2>{t("For my family: this week")}</h2><p className="fw-who"><bdi>{w.name}</bdi>{w.className ? ` · ${t("Class {c}", { c: w.className })}` : ""}</p></div>
        <p className="fw-dates">{t("From {from} to {to}", { from: dayOf(w.from, lang), to: dayOf(w.to, lang) })}</p>
      </header>
      <ul className="fw-tiles">{tiles.map(([n, l]) => <li key={l} className="fw-tile"><b dir="ltr">{n}</b><span>{t(l)}</span></li>)}</ul>
      <section className="fw-sec"><h3>{t("Tasks I finished")}</h3>{list(w.tasks, "No tasks finished yet this week.")}</section>
      <section className="fw-sec"><h3>{t("ReadRise articles I read")}</h3>{list(w.articles, "No articles yet this week.")}</section>
      <section className="fw-sec"><h3>{t("Lessons I learned")}</h3>{list(w.lessons, "No lessons yet this week.")}</section>
      <section className="fw-sec"><h3>{t("My tests")}</h3>{w.tests.length ? <ul>{w.tests.map((x, i) => <li key={i}><bdi>{x.title}</bdi> · <span className="fw-score" dir="ltr">{x.pct}%</span></li>)}</ul> : <p className="fw-none">{t("No test results this week.")}</p>}</section>
      <section className="fw-sec"><h3>{t("Things to practise at home")}</h3>
        <ul className="fw-home">{w.practise.map((p) => <li key={p.key}><b>{t(p.title)}</b>{t("At home:")} {t(p.activity)}</li>)}</ul>
      </section>
      {w.note && <section className="fw-sec"><h3>{t("A note from my teacher")}</h3><p className="fw-note" dir="auto">{w.note}</p></section>}
      <p className="fw-foot">{t("Ask me what I learned this week!")}</p>
    </article>
  );
}
