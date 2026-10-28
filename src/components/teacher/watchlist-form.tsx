"use client";
/** 👁️ Add/remove a student on the teacher's own watchlist (Oct 2026, daily-reports consolidation). */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useT } from "@/i18n/client";
import { toggleWatchStudentAction } from "@/app/teacher/actions";
import { Combo } from "@/components/ui/combo";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/ui-kit";

export function AddToWatchlist({ students }: { students: { id: string; name: string; className: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [studentId, setStudentId] = useState("");
  const noteRef = useRef<HTMLInputElement>(null);
  if (!students.length) return null;
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200"
      onSubmit={(e) => { e.preventDefault(); if (!studentId) return; start(async () => { await toggleWatchStudentAction(studentId, noteRef.current?.value ?? ""); setStudentId(""); if (noteRef.current) noteRef.current.value = ""; router.refresh(); }); }}>
      <label className="min-w-56 flex-1">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{t("Student")}</span>
        <Combo label={t("Choose a student")} value={studentId} onChange={setStudentId} options={students.map((s) => ({ value: s.id, label: s.name, hint: s.className }))} className="w-full" />
      </label>
      <label className="min-w-56 flex-1">
        <span className="mb-1 block text-xs font-semibold text-slate-600">{t("Note (optional)")}</span>
        <input ref={noteRef} type="text" maxLength={200} placeholder={t("Why you are watching this student")} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" />
      </label>
      <button type="submit" disabled={pending || !studentId} className={BTN_PRIMARY}>{t("Add to watchlist")}</button>
    </form>
  );
}

export function RemoveFromWatchlist({ studentId }: { studentId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { await toggleWatchStudentAction(studentId); router.refresh(); })} className={`${BTN_SECONDARY} shrink-0`}>
      {t("Remove")}
    </button>
  );
}
