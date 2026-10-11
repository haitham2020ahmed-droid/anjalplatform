/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 👪 The weekly family summary on one A4 page (print kit design). Interface words go through t() (English or
 * Arabic, the platform's language switch); skill names and badge names stay as they are (English content).
 * Plain words only: "Strong", "On track", "Growing" — never level names.
 */
import type { WeeklyBatch, WeeklySummary, Snapshot } from "@/reports/weekly-summary";
import { PrintFooter, PrintHeader, PrintMeta, PrintPage, PrintPill, PrintSection, PrintTiles, tEn, type T } from "./print-kit";
import { printDate, type PrintAccent } from "./tokens";

export const WEEKLY_CSS = `
.pk-wk-list{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.pk-wk-list li{padding:3px 12px;border-radius:999px;background:#eef3fa;color:#1f3a68;font-size:12px;font-weight:600}
.pk-wk-done li{background:#e7f6ec;color:#166534}
.pk-wk-read{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pk-wk-card{border-radius:14px;padding:10px 12px;border:1px solid #e2e8f0;background:#fff;break-inside:avoid}
.pk-wk-card h3{margin:0 0 4px;font-size:13px;color:var(--pk-c)}
.pk-wk-card p{margin:2px 0 0;font-size:11.5px;color:#475569}
.pk-wk-badges{display:flex;flex-wrap:wrap;gap:8px}
.pk-wk-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:12px;background:#fff8e1;border:1px solid #f6d77b;font-size:12px;font-weight:600;color:#7a4b00}
.pk-wk-badge span{font-size:16px}
.pk-wk-tip{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.5}
.pk-wk-tip span{font-size:22px;line-height:1}
.pk-wk-muted{font-size:12px;color:#64748b;margin:0}
@media (max-width:640px){.pk-wk-read{grid-template-columns:1fr}}
`;

const WORD_ACCENT: Record<Snapshot, PrintAccent> = { Strong: "map", "On track": "curriculum", Growing: "rti", "Not this week": "navy" };
const MARK: Record<Snapshot, string> = { Strong: "★", "On track": "✓", Growing: "↗", "Not this week": "○" };

function Word({ w, t }: { w: Snapshot; t: T }) {
  return <PrintPill accent={WORD_ACCENT[w]}><span aria-hidden="true">{MARK[w]}</span>{t(w)}</PrintPill>;
}

/** One student's page. */
export function WeeklySummaryPage({ w, batch, t = tEn }: { w: WeeklySummary; batch: Pick<WeeklyBatch, "teacher" | "schoolName">; t?: T }) {
  const first = w.name.split(/\s+/)[0] || w.name;
  return (
    <PrintPage label={t("Weekly family summary")} className="pk-weekly">
      <PrintHeader title={t("Weekly family summary")} subtitle={<>{printDate(w.from)} – {printDate(w.to)}</>} school={batch.schoolName} date={w.to} t={t} />
      <PrintMeta items={[{ label: t("Student"), value: w.name }, { label: t("Class"), value: w.className }, { label: t("Grade"), value: String(w.grade) }, { label: t("Teacher"), value: batch.teacher }]} />
      <PrintTiles items={[
        { label: t("Minutes practised"), value: w.minutes, accent: "teal" },
        { label: t("Questions answered"), value: w.answers, hint: w.accuracy === null ? undefined : t("{n}% correct", { n: w.accuracy }), accent: "curriculum" },
        { label: t("Days active"), value: `${w.activeDays} / 7`, accent: "map" },
        { label: t("Badges earned"), value: w.badges.length, accent: "grammar" },
      ]} />
      <PrintSection title={t("What {name} practised this week", { name: first })} icon="📚" accent="curriculum">
        {w.skills.length ? <ul className="pk-wk-list">{w.skills.map((k) => <li key={k}><bdi>{k}</bdi></li>)}</ul> : <p className="pk-wk-muted">{t("No practice this week yet. A few short sessions next week will help.")}</p>}
        {w.completed.length > 0 && <><p className="pk-wk-muted" style={{ margin: "8px 0 4px" }}>{t("Skills completed this week")}</p><ul className="pk-wk-list pk-wk-done">{w.completed.map((k) => <li key={k}>✓ <bdi>{k}</bdi></li>)}</ul></>}
      </PrintSection>
      <PrintSection title={t("Reading snapshot")} icon="📖" accent="nafs">
        <div className="pk-wk-read">
          <div className="pk-wk-card" style={{ ["--pk-c" as string]: "#0f766e" }}><h3>ReadRise</h3><Word w={w.readrise.word} t={t} /><p>{t("{n} articles finished", { n: w.readrise.done })}{w.readrise.avg !== null ? ` · ${t("{n}% correct", { n: w.readrise.avg })}` : ""}</p></div>
          <div className="pk-wk-card" style={{ ["--pk-c" as string]: "#1f5fbf" }}><h3>ReadMaster</h3><Word w={w.readmaster.word} t={t} /><p>{t("{n} texts read", { n: w.readmaster.done })}{w.readmaster.avg !== null ? ` · ${t("{n}% correct", { n: w.readmaster.avg })}` : ""}</p></div>
          <div className="pk-wk-card" style={{ ["--pk-c" as string]: "#6d28d9" }}><h3>{t("Reading aloud")}</h3><Word w={w.fluency.word} t={t} /><p>{w.fluency.wcpm !== null ? t("{n} words a minute", { n: w.fluency.wcpm }) : t("No reading aloud yet")}{w.fluency.readings ? ` · ${t("{n} readings", { n: w.fluency.readings })}` : w.fluency.date ? ` · ${printDate(w.fluency.date)}` : ""}</p></div>
        </div>
      </PrintSection>
      <PrintSection title={t("Badges earned")} icon="🏅" accent="gold">
        {w.badges.length ? <div className="pk-wk-badges">{w.badges.map((b, i) => <span key={`${b.name}-${i}`} className="pk-wk-badge"><span aria-hidden="true">{b.icon}</span><bdi>{b.name}</bdi></span>)}</div> : <p className="pk-wk-muted">{t("No new badges this week. Keep going!")}</p>}
      </PrintSection>
      <PrintSection title={t("One tip for home")} icon="🏠" accent="map">
        <div className="pk-callout pk-wk-tip"><span aria-hidden="true">💡</span><div>{t(w.tip.text, w.tip.vars)}</div></div>
      </PrintSection>
      <PrintFooter t={t} right={<>{t("Thank you for reading with your child.")}</>} />
    </PrintPage>
  );
}

/** One page per student (a whole class prints in one go). */
export function WeeklySummarySheets({ batch, t = tEn }: { batch: WeeklyBatch; t?: T }) {
  return <>{batch.items.map((w) => <WeeklySummaryPage key={w.studentId} w={w} batch={batch} t={t} />)}</>;
}
