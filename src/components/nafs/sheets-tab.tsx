import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { listNafsTests, nafsClasses } from "@/server/nafs/tests";

const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";
const STEPS = [
  "Print one sheet per student (name, class and a machine-readable code are printed on it), or blank sheets.",
  "Students fill the bubbles A–D with a dark pencil or pen. Black-and-white printing works.",
  "Open “Grade bubble sheets”: take photos with the phone camera or upload photos / scans (several at once).",
  "The sheets are read in your browser: no image is sent or stored, only the answers.",
  "Check the review screen (uncertain rows are highlighted), fix with one tap, confirm. The results go to Reports.",
];

/** 🇸🇦 Bubble sheets: print the sheets of a saved test for a Grade 6 class, grade them by photo, or type the answers. */
export async function SheetsTab({ actor, t }: { actor: Actor; t: TFn }) {
  const [tests, classes] = await Promise.all([listNafsTests(repo, actor), nafsClasses(repo, actor)]);
  const ok = tests.filter((x) => x.questions <= 60);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line">
        <h2 className="text-lg font-semibold text-ink">{t("Bubble sheets")}</h2>
        {!ok.length || !classes.length ? <p className="mt-3 rounded-xl bg-surface-2 p-4 text-sm text-muted">{t(!classes.length ? "You have no Grade 6 class yet." : "Save a NAFS test first (Tests tab).")}</p> : (
          <form method="get" action="/teacher/nafs/sheets" className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Test")}
              <select name="test" className={SEL} defaultValue={ok[0].id}>{ok.map((x) => <option key={x.id} value={x.id}>{x.title} · {t("{n} questions", { n: x.questions })}</option>)}</select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("Class")}
              <select name="class" className={SEL}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {t("{n} students", { n: c.students.length })}</option>)}</select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button formAction="/teacher/nafs/sheets" className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">🖨 {t("Print bubble sheets")}</button>
              <button formAction="/teacher/nafs/sheets" name="blank" value="1" className="min-h-11 rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">{t("Blank sheets")}</button>
              <button formAction="/teacher/nafs/sheets" name="go" value="grade" className="min-h-11 rounded-xl bg-teal-700 px-4 font-semibold text-white">📷 {t("Grade bubble sheets")}</button>
              <button formAction="/teacher/nafs/sheets" name="go" value="type" className="min-h-11 rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⌨ {t("Type answers")}</button>
            </div>
          </form>
        )}
      </section>
      <aside className="rounded-2xl bg-surface-2 p-5 ring-1 ring-line">
        <h3 className="font-semibold text-ink">{t("How it works")}</h3>
        <ol className="mt-2 grid list-decimal gap-1.5 ps-5 text-sm text-ink-2">{STEPS.map((x) => <li key={x}>{t(x)}</li>)}</ol>
      </aside>
    </div>
  );
}
