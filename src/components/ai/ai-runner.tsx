/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";
/** ▶ Runs the AI queue in small steps with a progress bar; waits by itself for the rate limits; resumes on reload. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Tick = (jobId: string | null) => Promise<{ done: number; total: number; failed: number; status: string | null; waitMs: number; message: string | null; idle: boolean }>;

export function AiRunner({ jobId, tick, autoStart = true, label = "AI work" }: { jobId: string | null; tick: Tick; autoStart?: boolean; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ done: number; total: number; failed: number; status: string | null; message: string | null; waitUntil: number }>({ done: 0, total: 0, failed: 0, status: null, message: null, waitUntil: 0 });
  const [running, setRunning] = useState(autoStart);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const step = async () => {
      if (!alive || busy.current) return;
      busy.current = true;
      try {
        const r = await tick(jobId);
        if (!alive) return;
        setState({ done: r.done, total: r.total, failed: r.failed, status: r.status, message: r.message, waitUntil: Date.now() + r.waitMs });
        if (r.idle || r.status === "DONE" || r.status === "STOPPED") { setRunning(false); router.refresh(); return; }
        setTimeout(step, Math.max(400, r.waitMs));
      } catch { if (alive) setTimeout(step, 15_000); }
      finally { busy.current = false; }
    };
    step();
    return () => { alive = false; };
  }, [running, jobId, tick, router]);
  const pct = state.total ? Math.round(((state.done + state.failed) / state.total) * 100) : 0;
  const wait = Math.max(0, Math.ceil((state.waitUntil - now) / 1000));
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <b className="text-brand-navy">{label}</b>
        <span className="tabular-nums text-slate-600">{state.done} done{state.failed ? ` · ${state.failed} failed` : ""}{state.total ? ` of ${state.total}` : ""}{state.status === "DONE" ? " · ✅ finished" : ""}</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand-teal transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      {state.message && <p className="mt-2 text-sm text-amber-900">{state.message}{wait > 0 && wait < 3600 ? ` (${wait} s)` : ""}</p>}
      {!running && state.status !== "DONE" && <button type="button" onClick={() => setRunning(true)} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">▶ Continue</button>}
      {running && <p className="mt-2 text-xs text-slate-500">Keep this page open. If you close it, the work pauses and continues next time from where it stopped.</p>}
    </div>
  );
}
