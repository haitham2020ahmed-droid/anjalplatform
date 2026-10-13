import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/plans/print-button";
import { getT } from "@/i18n/server";

/**
 * 👀 "Preview as student": the student's own page, for a teacher, read-only. A bar on top (who, what this is,
 * ⬇ Download PDF / 🖨 Print — the same print layout as the plan preview — and Close), then the student's page itself,
 * inert (no button, link or form acts). Without a preview it draws only the page.
 */
export async function PreviewFrame({ preview, children }: { preview: { studentId: string; name: string } | null; children: ReactNode }) {
  if (!preview) return <>{children}</>;
  const { t } = await getT();
  return (
    <>
      <div data-testid="student-preview-bar" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-700 px-5 py-3 text-white shadow print:hidden">
        <p className="min-w-0 font-semibold">👀 {t("Preview as student: {name}", { name: preview.name })} <span className="block text-sm font-normal text-sky-100">{t("This is exactly what the student sees. Read only: nothing is answered, sent or saved.")}</span></p>
        <span className="flex flex-wrap gap-2">
          <PrintButton />
          <Link href={`/teacher/student-view?student=${encodeURIComponent(preview.studentId)}`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-sky-800">{t("Close preview")}</Link>
        </span>
      </div>
      <div inert aria-readonly="true" className="select-text">{children}</div>
    </>
  );
}
