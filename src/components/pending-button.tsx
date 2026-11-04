"use client";
import { useFormStatus } from "react-dom";
import { useT } from "@/i18n/client";

/**
 * 🎯 r78 (NAFS), shared since r79 (MAP): a form's submit button that answers at once — while the request runs it shows
 * `pendingLabel` (e.g. "Assigning…", "Sending…") and is disabled, so a second press never sends the same work twice.
 * Labels are English UI strings (translated here, with `vars` for {name}-style values). `formAction` sends the form to
 * another action than the form's own (as a plain <button formAction> does).
 */
export function PendingButton({ label, pendingLabel, icon, className, name, value, vars, formAction, testId }: {
  label: string; pendingLabel: string; icon?: string; className?: string; name?: string; value?: string;
  vars?: Record<string, string | number>; formAction?: (f: FormData) => void | Promise<void>; testId?: string;
}) {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} aria-busy={pending} data-testid={testId} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-70`}>
      {icon && !pending ? `${icon} ` : ""}{pending ? t(pendingLabel) : t(label, vars)}
    </button>
  );
}
