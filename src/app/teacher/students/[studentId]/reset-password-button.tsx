"use client";
import { useState, useTransition } from "react";
import { resetPasswordAction } from "@/server/actions-users";

/** Shows the temporary password once so the teacher can give it to the student. */
export function ResetPasswordButton({ userId }: { userId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-lg font-bold text-brand-navy">Password</h2>
      <p className="text-sm text-slate-600">Gives the student a temporary password. They choose a new one when they next sign in.</p>
      <button disabled={pending} onClick={() => start(async () => { const r = await resetPasswordAction(userId); setMsg(r.error ?? `Temporary password: ${r.temporaryPassword}`); })}
        className="mt-3 rounded-lg border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50">Reset password</button>
      {msg && <p role="status" className="mt-3 font-semibold text-brand-navy">{msg}</p>}
    </div>
  );
}
