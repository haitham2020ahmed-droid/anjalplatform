"use client";
import { useActionState } from "react";
import type { Result } from "@/app/admin/actions";

/**
 * Form bound to a server action: shows the action's message or error, and a new
 * temporary password exactly once (it is never stored in readable form).
 */
export function ActionForm({ action, children, submit, className, danger }: {
  action: (s: Result, f: FormData) => Promise<Result>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  danger?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={`rounded-xl px-5 py-2.5 font-semibold text-white disabled:opacity-60 ${danger ? "bg-red-700 hover:bg-red-800" : "bg-brand-navy hover:bg-brand-purple"}`}>
          {pending ? "Saving…" : submit}
        </button>
        {state.message && <span role="status" className="text-sm font-medium text-brand-teal">{state.message}</span>}
        {state.error && <span role="alert" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{state.error}</span>}
      </div>
      {state.temporaryPassword && (
        <p role="status" className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          Account created. Temporary password (shown only now): <code className="select-all rounded bg-white px-2 py-1 font-mono font-bold">{state.temporaryPassword}</code>
          <br /><span className="text-sm text-slate-600">The user must choose a new password at first sign-in.</span>
        </p>
      )}
    </form>
  );
}
