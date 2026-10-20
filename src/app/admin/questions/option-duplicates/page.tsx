import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { BankTabs } from "../bank-tabs";
import { duplicateOptionQuestions } from "@/server/admin/option-duplicates";
import { LineIcon } from "@/components/ui/line-icon";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "Duplicate Answers" };

/** 🔁 Same answer, two letters: a multiple-choice question whose options repeat the same words — the "risky" ones
 * (one of the matching options is the key, the other is not) are the exact shape of "I picked the right answer
 * and it was marked wrong." See src/server/admin/option-duplicates.ts for the full explanation. */
export default async function OptionDuplicatesPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN", "TEACHER"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { rows, checked } = await duplicateOptionQuestions(repo, actor);
  const risky = rows.filter((r) => r.risky);
  const plain = rows.filter((r) => !r.risky);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Questions" }} icon="alert" title="Duplicate Answers"
        subtitle={t("A multiple-choice, dropdown or multi-select question where two answer choices read the same words under different letters. Grading goes by the letter, not the words — so this is how a student can pick an answer that reads exactly like \"the correct answer\" shown after her, and still be marked wrong.")} />
      <BankTabs />
      <p className="mb-4 text-sm text-slate-600">{t("Checked")} {checked} · {risky.length} {t("risky")} · {plain.length} {t("worth a look")}</p>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{t("No question has two answer choices reading the same words.")}</p>
      ) : (
        <div className="space-y-6">
          {risky.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-red-800"><LineIcon name="alert" className="h-4 w-4" />{t("Risky — one of the matching answers is marked correct, the other is not")}</h2>
              <ul className="space-y-3">{risky.map((r) => <Row key={r.questionId} r={r} t={t} />)}</ul>
            </section>
          )}
          {plain.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold text-slate-600">{t("Worth a look — the repeated answers agree on correct/wrong, so grading is not affected, but the repeat is still confusing to read")}</h2>
              <ul className="space-y-3">{plain.map((r) => <Row key={r.questionId} r={r} t={t} />)}</ul>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function Row({ r, t }: { r: { questionId: string; stem: string; skill: string; grade: number; groups: { labels: string[]; text: string; mixedCorrectness: boolean }[]; risky: boolean }; t: (s: string) => string }) {
  return (
    <li className={`rounded-2xl bg-white p-4 ring-1 ${r.risky ? "ring-red-300" : "ring-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy"><RichInline text={r.stem} /></p>
          <p className="mt-0.5 text-xs text-slate-500">{r.skill}{r.grade ? ` · ${t("Grade")} ${r.grade}` : ""}</p>
        </div>
        <Link href={`/admin/questions/${r.questionId}`} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Open")} ▶</Link>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {r.groups.map((g) => (
          <li key={g.labels.join("")} className={g.mixedCorrectness ? "text-red-700" : "text-slate-600"}>
            {g.mixedCorrectness && <LineIcon name="alert" className="me-1 inline-block h-3.5 w-3.5 align-[-2px]" />}
            <b>{g.labels.join(" & ")}</b> {t("both read")}: “{g.text}”{g.mixedCorrectness ? ` — ${t("only one of them is the marked correct answer")}` : ""}
          </li>
        ))}
      </ul>
    </li>
  );
}
