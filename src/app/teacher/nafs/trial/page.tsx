import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { AnswerSheet } from "@/components/omr/answer-sheet";
import { TrialCheck } from "@/components/omr/trial-check";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { OMR_INSTRUCTION, OMR_SCANNER_LABELS } from "@/lib/omr/labels";
import { TRIAL_HOW, TRIAL_KEY, TRIAL_QUESTIONS, trialCode, trialLayout } from "@/lib/omr/trial";
import { getT } from "@/i18n/server";

export const metadata = { title: "Bubble sheet trial" };

const L = ["A", "B", "C", "D"];
const CSS = `.trial-sheet{position:relative;width:210mm;height:297mm;margin:0 auto 24px;box-shadow:0 0 0 1px #e2e8f0;background:#fff;color:#000}
@media print{@page{size:A4;margin:0}body{background:#fff!important}.trial-sheet{box-shadow:none;margin:0}}`;

/**
 * 🧪 Bubble sheet trial (NAFS → Marking → "Print a trial sheet"): ONE printable A4 page — a sample test of 20
 * questions with its answer key printed beside the bubbles (a few hard cases on purpose: a light mark, an erased and
 * changed answer, an empty one, a double mark). Print at 100 %, fill it with a pencil as the key says, photograph it
 * with a phone (on a table, any angle) and check the photo below: it is read in the browser and compared with the
 * key — never uploaded, never saved.
 */
export default async function BubbleTrialPage() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const [me, { t }] = await Promise.all([getActor(), getT()]);
  const layout = trialLayout();
  const rows = [...new Map(layout.bubbles.map((b) => [b.q, b.cy])).entries()];
  const keyX = Math.max(...layout.bubbles.map((b) => b.cx)) + 9;
  const howText = (k: (typeof TRIAL_KEY)[number]) => k.how === "FILL" ? t("Fill") + ` ${L[k.answer!]}`
    : t(TRIAL_HOW[k.how], { a: k.answer !== null ? L[k.answer] : "", e: k.erase !== undefined ? L[k.erase] : "", b: k.second !== undefined ? L[k.second] : "" }) + (k.how === "LIGHT" ? `: ${L[k.answer!]}` : "");
  return (
    <AppShell name={String(me!.user.displayName)}>
      <style>{CSS}</style>
      <div className="mb-4 grid gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/teacher/nafs?tab=marking#sheets" className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-ink-2 ring-1 ring-line">‹ {t("Back")}</Link>
          <h1 className="text-2xl font-semibold text-ink">🧪 {t("Bubble sheet trial")}</h1>
          <span className="flex-1" />
          <PrintButton label={t("Print / Save as PDF")} />
        </div>
        <ol className="grid list-decimal gap-1 rounded-2xl bg-surface p-4 ps-9 text-sm text-ink-2 ring-1 ring-line">
          <li>{t("Print this page at 100% (no “fit to page”).")}</li>
          <li>{t("Fill the {n} questions with a pencil exactly as the key beside the bubbles says (it includes a light mark, an erased answer, an empty one and a double mark on purpose).", { n: TRIAL_QUESTIONS })}</li>
          <li>{t("Put the sheet on a table and take a photo with your phone: the whole sheet with its four black corner squares, any angle.")}</li>
          <li>{t("Choose the photo below (or use the camera): it is read on this device and compared with the key. Nothing is uploaded or saved.")}</li>
        </ol>
      </div>
      <div className="trial-sheet">
        <AnswerSheet layout={layout} title={t("Bubble sheet trial")} code={trialCode()} labels={{ name: t("Name"), class: t("Class"), code: t("Code"), instruction: t(OMR_INSTRUCTION) }} />
        {/* the key, beside each row (outside the bubbles: the reader never looks there) */}
        <div style={{ position: "absolute", left: `${keyX}mm`, top: "57mm", fontSize: "3mm", fontWeight: 700, color: "#334155" }}>{t("Answer key: fill exactly this")}</div>
        {rows.map(([q, cy]) => {
          const k = TRIAL_KEY.find((x) => x.q === q)!;
          return <div key={q} dir="auto" style={{ position: "absolute", left: `${keyX}mm`, top: `${cy - 3}mm`, height: "6mm", width: `${186 - keyX}mm`, display: "flex", alignItems: "center", fontSize: "2.9mm", color: k.how === "FILL" ? "#475569" : "#9a3412", whiteSpace: "nowrap", overflow: "hidden" }}>→ {howText(k)}</div>;
        })}
        <div dir="auto" style={{ position: "absolute", left: "24mm", top: "70mm", width: "54mm", fontSize: "3mm", lineHeight: 1.45, color: "#475569" }}>
          <p style={{ fontWeight: 700, margin: "0 0 2mm" }}>{t("Bubble sheet trial")}</p>
          <p style={{ margin: "0 0 2mm" }}>{t("Fill the bubbles as the key on the right says, then photograph the sheet and check it on the trial page.")}</p>
          <p style={{ margin: 0 }}>{t("A good reader reads every normal mark, reads or asks about the light one, and ASKS about the double mark — it never guesses.")}</p>
        </div>
      </div>
      <section className="mt-2 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:hidden" aria-label={t("Check my photo")}>
        <h2 className="mb-3 text-lg font-semibold text-ink">📷 {t("Check my photo")}</h2>
        <TrialCheck scannerLabels={Object.fromEntries(OMR_SCANNER_LABELS.map((w) => [w, t(w)]))} />
      </section>
    </AppShell>
  );
}
