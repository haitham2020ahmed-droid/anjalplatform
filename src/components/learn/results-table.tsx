"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { ReportTable, type Col } from "@/components/report-kit/report-table";

export interface LearnResultRow { studentId: string; name: string; className: string; assigned: boolean; dueAt: string | null; opened: string | null; finished: string | null; score: number | null; best: number | null; again: boolean; attempts: number; minutes: number; level: number | null }
const day = (v: string | null) => (v ? v.slice(0, 10) : "—");

/**
 * Per-student results of a lesson / selection (teacher side: the level is shown here only). Fewer columns (r70):
 * Student · Finished · Score · Needed "again"; the class, assigned, opened, time and level wait behind "More details".
 */
export function LearnResultsTable({ rows, words = false }: { rows: LearnResultRow[]; words?: boolean }) {
  const t = useT();
  if (!rows.length) return <p className="rounded-2xl bg-surface p-6 text-center text-muted ring-1 ring-line">{t("No student has opened it or been given it yet.")}</p>;
  const cols: Col[] = [
    { key: "n", label: "Student" }, { key: "f", label: "Finished" }, { key: "s", label: "Score", num: true },
    ...(!words ? [{ key: "ag", label: "Needed “again”" }] : []),
    { key: "c", label: "Class", more: true }, { key: "as", label: "Was assigned", more: true }, { key: "o", label: "Opened", more: true }, { key: "tm", label: "Time", more: true },
    ...(!words ? [{ key: "lv", label: "Level", more: true }] : []),
  ];
  return (
    <ReportTable label="Learn results" cols={cols}
      rows={rows.map((r) => ({
        id: r.studentId, flag: r.again ? "warn" as const : undefined,
        sort: { n: r.name, f: r.finished, s: r.score, ag: r.again ? 1 : 0, c: r.className, as: r.assigned ? r.dueAt ?? "✓" : null, o: r.opened, tm: r.minutes || null, lv: r.level },
        cells: {
          n: <Link prefetch={false} href={`/teacher/learn/student/${r.studentId}`} className="font-semibold text-ink hover:underline"><bdi>{r.name}</bdi></Link>,
          f: <span dir="ltr">{r.finished ? `✓ ${day(r.finished)}` : "—"}</span>,
          s: <span dir="ltr">{r.score === null ? "—" : `${r.score}${words ? "" : " / 3"}${r.attempts > 1 ? ` (${t("{n} tries", { n: r.attempts })})` : ""}`}</span>,
          ag: r.again ? t("Yes") : t("No"),
          c: r.className,
          as: <span dir="ltr">{r.assigned ? (r.dueAt ? `✓ ${day(r.dueAt)}` : "✓") : "—"}</span>,
          o: <span dir="ltr">{day(r.opened)}</span>,
          tm: <span dir="ltr">{r.minutes ? `${r.minutes} min` : "—"}</span>,
          lv: <span dir="ltr">{r.level ?? "—"}</span>,
        },
      }))} />
  );
}
