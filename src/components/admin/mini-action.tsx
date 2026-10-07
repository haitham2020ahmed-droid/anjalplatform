"use client";
import { useActionState } from "react";

type Result = { ok?: boolean; error?: string; message?: string };

/**
 * A small inline button that runs a server action with hidden fields and shows the server's
 * message beside it (e.g. “cannot be deleted… deactivate it instead”). `confirm` asks first.
 */
export function MiniAction({ action, fields, label, confirm: ask, tone = "plain", title }: {
  action: (s: Result, f: FormData) => Promise<Result>; fields: Record<string, string>; label: string; confirm?: string; tone?: "plain" | "danger"; title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex items-center gap-1" onSubmit={(e) => { if (ask && !window.confirm(ask)) e.preventDefault(); }}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button disabled={pending} title={title} aria-label={title ?? label}
        className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 disabled:opacity-50 ${tone === "danger" ? "text-red-700 ring-red-200 hover:bg-red-50" : "text-brand-navy ring-slate-300 hover:bg-slate-50"}`}>{label}</button>
      {state.error && <span role="alert" className="max-w-xs text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
