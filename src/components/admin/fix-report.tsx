/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from "next/link";
import type { FixReport } from "@/server/admin/stuck-questions";

const REPAIR_LABEL: Record<string, string> = {
  "answer key": "answer key restored from the stored data", "duplicate choice removed": "duplicate choices removed", "blank choice removed": "blank choices removed",
  "choices relabelled": "choices relabelled", difficulty: "difficulty set from the RIT / level", type: "question type set from its parts", "explanation from the key": "explanation written from the key", "feedback for wrong choices": "feedback for wrong choices written from the key",
};
const VIA_LABEL: Record<string, string> = { STANDARD: "by standard", MAP_PLACE: "by Curriculum Map place", CATEGORY: "Respond to Reading", READMASTER: "ReadMaster article", IMPORT_SKILL: "skill named in the import", TAGS: "skill named in the tags", MAP_GOAL: "by MAP goal" };

/**
 * The report of a “Fix stuck questions” run: one number per card, then what is left, each with its reason and a link to
 * its editor. No client code (the Question Bank runner and System check both draw it). `t` translates interface words.
 */
export function FixReportView({ report: r, t }: { report: FixReport; t: (s: string, v?: Record<string, string | number>) => string }) {
  const card = "rounded-xl bg-white p-3 ring-1 ring-slate-200";
  const big = "text-2xl font-bold tabular-nums text-brand-navy";
  const repaired = Object.entries(r.repaired);
  return (
    <div className="space-y-3" data-testid="fix-report">
      <p className="text-sm text-slate-600">{t(r.by === "auto" ? "Ran automatically after the update" : "Run by an admin")} · {r.startedAt.slice(0, 16).replace("T", " ")}{r.finishedAt ? "" : ` · ${t("not finished")}`}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={card}><p className={big}>{r.classified}</p><p className="text-sm text-slate-600">{t("put under a skill")}</p></div>
        <div className={card}><p className={big}>{r.repairedQuestions}</p><p className="text-sm text-slate-600">{t("repaired")}</p></div>
        <div className={card}><p className={big}>{r.published}</p><p className="text-sm text-slate-600">{t("published")}</p></div>
        <div className={card}><p className={`${big} ${r.notPublishedCount ? "text-amber-700" : ""}`}>{r.notPublishedCount}</p><p className="text-sm text-slate-600">{t("still need a person")}</p></div>
      </div>
      {r.after && (
        <p className="text-sm text-slate-700">{t("Before")}: {t("{n} without a skill", { n: r.before.unclassified })}, {t("{n} drafts", { n: r.before.drafts })}, {t("{n} waiting", { n: r.before.waiting })} → {t("Now")}: {t("{n} without a skill", { n: r.after.unclassified })}, {t("{n} drafts", { n: r.after.drafts })}, {t("{n} waiting", { n: r.after.waiting })}</p>
      )}
      {(Object.keys(r.byVia).length > 0 || repaired.length > 0) && (
        <p className="text-sm text-slate-600">
          {Object.entries(r.byVia).map(([k, n]) => `${n} ${t(VIA_LABEL[k] ?? k)}`).join(" · ")}
          {Object.keys(r.byVia).length > 0 && repaired.length > 0 && " · "}
          {repaired.map(([k, n]) => `${n} ${t(REPAIR_LABEL[k] ?? k)}`).join(" · ")}
        </p>
      )}
      {r.notPublished.length > 0 && (
        <details className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200" open={r.notPublished.length <= 10}>
          <summary className="cursor-pointer font-semibold text-amber-950">{t("Not published yet ({n}): open each one and fix it", { n: r.notPublishedCount })}</summary>
          <ul className="mt-2 space-y-1.5 text-sm">{r.notPublished.map((x) => (
            <li key={x.id} className="flex flex-wrap items-baseline gap-x-2"><Link href={`/admin/questions/${x.id}`} className="font-semibold text-brand-navy underline">{t("Open in editor")}</Link><span className="text-slate-800">{x.stem || x.id}</span><span className="text-amber-900">· {x.reason}</span></li>
          ))}</ul>
        </details>
      )}
      {(r.removedNoPassage ?? 0) > 0 && (
        <details className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" data-testid="fix-removed-no-passage">
          <summary className="cursor-pointer font-semibold text-slate-800">{t("Removed: they need a passage or picture that is not attached ({n})", { n: r.removedNoPassage ?? 0 })}</summary>
          <p className="mt-1 text-sm text-slate-600">{t("Hidden from the whole platform; students' answers are kept.")}</p>
          <ul className="mt-2 space-y-1.5 text-sm">{(r.removedList ?? []).map((x) => (
            <li key={x.id}><span className="text-slate-800">{x.stem || x.id}</span> <span className="text-slate-600">· {x.reason}</span></li>
          ))}</ul>
        </details>
      )}
      {r.left.length > 0 && (
        <details className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold text-slate-800">{t("Still without a skill ({n})", { n: r.leftCount })}</summary>
          <p className="mt-1 text-sm"><Link href="/admin/questions/unclassified" className="font-semibold text-brand-navy underline">{t("Choose their skills")}</Link></p>
          <ul className="mt-2 space-y-1.5 text-sm">{r.left.map((x) => (
            <li key={x.id}><Link href={`/admin/questions/${x.id}`} className="font-medium text-brand-navy underline">{x.stem || x.id}</Link> <span className="text-slate-600">· {x.reason}</span></li>
          ))}</ul>
        </details>
      )}
    </div>
  );
}
