"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

export interface LearnResultRow { studentId: string; name: string; className: string; assigned: boolean; dueAt: string | null; opened: string | null; finished: string | null; score: number | null; best: number | null; again: boolean; attempts: number; minutes: number; level: number | null }
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");

/** Per-student results of a lesson / selection (teacher side: the level is shown here only). */
export function LearnResultsTable({ rows, words = false }: { rows: LearnResultRow[]; words?: boolean }) {
  const t = useT();
  if (!rows.length) return <p className="rounded-2xl bg-surface p-6 text-center text-muted ring-1 ring-line">{t("No student has opened it or been given it yet.")}</p>;
  return (
    <div className="rk-box rk-cards">
      <table className="w-full text-sm">
        <thead><tr><th>{t("Student")}</th><th>{t("Class")}</th><th>{t("Was assigned")}</th><th>{t("Opened")}</th><th>{t("Finished")}</th><th>{t("Score")}</th>{!words && <th>{t("Needed “again”")}</th>}<th>{t("Time")}</th>{!words && <th>{t("Level")}</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId}>
              <td className="rk-first" data-label={t("Student")}><Link prefetch={false} href={`/teacher/learn/student/${r.studentId}`} className="font-semibold text-ink hover:underline"><bdi>{r.name}</bdi></Link></td>
              <td data-label={t("Class")}>{r.className}</td>
              <td data-label={t("Was assigned")} dir="ltr">{r.assigned ? (r.dueAt ? `✓ ${day(r.dueAt)}` : "✓") : "—"}</td>
              <td data-label={t("Opened")} dir="ltr">{day(r.opened)}</td>
              <td data-label={t("Finished")} dir="ltr">{r.finished ? `✓ ${day(r.finished)}` : "—"}</td>
              <td data-label={t("Score")} dir="ltr">{r.score === null ? "—" : `${r.score}${words ? "" : " / 3"}${r.attempts > 1 ? ` (${t("{n} tries", { n: r.attempts })})` : ""}`}</td>
              {!words && <td data-label={t("Needed “again”")}>{r.again ? t("Yes") : t("No")}</td>}
              <td data-label={t("Time")} dir="ltr">{r.minutes ? `${r.minutes} min` : "—"}</td>
              {!words && <td data-label={t("Level")} dir="ltr">{r.level ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
