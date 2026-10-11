"use client";
import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { createCertificateAction, giveBonusAction, type RewardFormState } from "@/app/teacher/rewards-actions";

const input = "min-h-11 rounded-lg border border-slate-300 px-3";
const btn = "min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white disabled:opacity-50";

function Status({ s, okText }: { s: RewardFormState; okText: string }) {
  if (!s) return null;
  return <p role="status" className={`text-sm font-semibold ${s.ok ? "text-emerald-700" : "text-red-700"}`}>{s.ok ? `${okText} ${s.msg}` : s.msg}</p>;
}

/** 🎁 Give bonus coins — one student (studentId) or the whole class (classId). */
export function BonusCoinsForm({ studentId, classId }: { studentId?: string; classId?: string }) {
  const t = useT();
  const [s, act, busy] = useActionState(giveBonusAction, null);
  return (
    <form action={act} className="flex flex-wrap items-end gap-2" data-testid="bonus-form">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      {classId && <input type="hidden" name="classId" value={classId} />}
      <label className="grid gap-1 text-sm font-semibold text-slate-700">{t("Coins")}<input name="amount" type="number" min={1} max={50} defaultValue={10} required className={`${input} w-24`} /></label>
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-slate-700">{t("Reason (optional)")}<input name="note" maxLength={120} placeholder={t("Great teamwork today!")} className={input} /></label>
      <button className={btn} disabled={busy}>{t(studentId ? "Give bonus coins" : "Give the whole class bonus coins")}</button>
      <div className="basis-full"><Status s={s} okText={t("Done!")} /></div>
    </form>
  );
}

/** 📜 Create a certificate for this student. */
export function CertificateForm({ studentId }: { studentId: string }) {
  const t = useT();
  const [s, act, busy] = useActionState(createCertificateAction, null);
  return (
    <form action={act} className="grid gap-2" data-testid="certificate-form">
      <input type="hidden" name="studentId" value={studentId} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">{t("Achievement")}<input name="title" required minLength={3} maxLength={120} placeholder={t("Outstanding effort in reading this term")} className={input} /></label>
      <button className={`${btn} justify-self-start`} disabled={busy}>{t("Create certificate")}</button>
      <Status s={s} okText={t("Certificate created")} />
    </form>
  );
}
