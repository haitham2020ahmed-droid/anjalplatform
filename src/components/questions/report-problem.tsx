import { reportProblemAction } from "@/app/admin/questions/request-actions";
import { FLAG_REASONS } from "@/server/teacher/classroom";

/** 🚩 Report a problem with one question (teachers): a small folded form; the admin sees it in Question Check → Flags. */
export function ReportProblem({ questionId, back, label = "Report a problem" }: { questionId: string; back?: string; label?: string }) {
  return (
    <details className="text-sm" data-testid="report-problem">
      <summary className="cursor-pointer font-semibold text-rose-700">🚩 {label}</summary>
      <form action={reportProblemAction} className="mt-2 grid gap-2 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
        <input type="hidden" name="questionId" value={questionId} />
        {back && <input type="hidden" name="back" value={back} />}
        <select name="reason" required defaultValue="WRONG_ANSWER" className="rounded-lg border border-slate-300 px-2 py-1.5">
          {Object.entries(FLAG_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <textarea name="note" rows={2} maxLength={500} placeholder="What is wrong? (optional)" className="rounded-lg border border-slate-300 px-2 py-1.5" />
        <button className="justify-self-start rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white">Send to the admin</button>
      </form>
    </details>
  );
}
