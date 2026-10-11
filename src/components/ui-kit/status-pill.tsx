"use client";
import { useT } from "@/i18n/client";
import { STATUS_STYLE, workStatus, type WorkStatus } from "./tokens";

/** Not started / In progress / Done — the only three words students see for work status. */
export function StatusPill({ status, className = "" }: { status: WorkStatus | string; className?: string }) {
  const t = useT();
  const s = STATUS_STYLE[workStatus(status)];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${s.className} ${className}`}>
      <span aria-hidden="true">{s.icon}</span>{t(s.label)}
    </span>
  );
}
