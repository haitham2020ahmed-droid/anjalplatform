"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Failure = { message: string; details: string[]; jobId?: string };
type Phase = { kind: "idle" } | { kind: "uploading"; percent: number } | { kind: "checking" };

const ACCEPT = ".csv,.xlsx";
const OK_NAME = /\.(csv|xlsx)$/i;

/**
 * Sends the file with a visible upload percentage, then waits while the server checks every row.
 * Any reply that is not the expected JSON still produces a specific message (never just "failed").
 */
function upload(file: File, onProgress: (p: number) => void, target: "BANK" | "CURRICULUM" = "BANK", place?: string): Promise<{ status: number; body: { jobId?: string; error?: string; details?: string[] } | null; raw: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/question-imports");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((100 * e.loaded) / e.total)); };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* handled below */ }
      resolve({ status: xhr.status, body, raw: xhr.responseText });
    };
    xhr.onerror = () => reject(new Error("The connection to the server was lost during the upload. Check your internet connection and try again."));
    xhr.ontimeout = () => reject(new Error("The server took too long to answer. Try again; if it happens again, split the file into smaller files."));
    xhr.timeout = 6 * 60 * 1000;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("target", target);
    if (place) fd.set("place", place);
    xhr.send(fd);
  });
}

/** target: BANK (Question Bank only) or CURRICULUM (on the Curriculum Map, and in the bank). */
export function ImportUpload({ target = "BANK", place }: { target?: "BANK" | "CURRICULUM"; place?: string } = {}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [failure, setFailure] = useState<Failure | null>(null);
  const busy = phase.kind !== "idle";

  function choose(f: File | null | undefined) {
    setFailure(null);
    if (!f) return;
    if (!OK_NAME.test(f.name)) {
      setFile(null);
      setFailure({ message: `“${f.name}” cannot be imported. Only CSV (.csv) and Excel (.xlsx) files are accepted. Use the official CSV or Excel template for the highest import accuracy.`, details: [] });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFile(null);
      setFailure({ message: "The file is larger than 10 MB. Split it into smaller files.", details: [] });
      return;
    }
    setFile(f);
  }

  async function analyze() {
    if (!file) return;
    setFailure(null);
    setPhase({ kind: "uploading", percent: 0 });
    try {
      const res = await upload(file, (percent) => setPhase(percent >= 100 ? { kind: "checking" } : { kind: "uploading", percent }), target, place);
      if (res.status === 200 && res.body?.jobId) {
        router.push(`/admin/questions/import/${res.body.jobId}`);
        return;
      }
      const message = res.body?.error
        ?? (res.status === 413 ? "The file is too large for the server. Split it into smaller files."
          : res.status === 401 || res.status === 403 ? "Your session has ended or you do not have permission. Sign in again and retry."
          : res.status === 502 || res.status === 503 || res.status === 504 ? "The server is starting up or busy. Wait a minute and try again."
          : `The server answered with an unexpected error (HTTP ${res.status}). Try again; if it continues, send this message to the administrator.`);
      setFailure({ message, details: res.body?.details?.filter((d) => d !== message) ?? [], jobId: res.body?.jobId });
    } catch (e) {
      setFailure({ message: (e as Error).message, details: [] });
    }
    setPhase({ kind: "idle" });
  }

  return (
    <div className="space-y-4">
      <div
        role="button" tabIndex={0} aria-label="Choose or drop a CSV or Excel file"
        onClick={() => !busy && input.current?.click()} onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!busy) choose(e.dataTransfer.files[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${over ? "border-brand-teal bg-teal-50" : "border-slate-300 bg-slate-50"}`}
      >
        <p className="text-lg font-semibold text-brand-navy">{file ? file.name : "Drop your CSV or Excel file here, or click to choose"}</p>
        <p className="mt-1 text-sm text-slate-600">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "CSV (.csv) or Excel (.xlsx) · up to 10 MB · up to 5,000 questions"}</p>
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {failure && (
        <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200">
          <p className="font-semibold">{failure.message}</p>
          {failure.details.length > 0 && <ul className="mt-2 list-disc space-y-0.5 ps-5 text-sm">{failure.details.map((d) => <li key={d}>{d}</li>)}</ul>}
          <p className="mt-2 text-sm">Fix the file and upload it again.{failure.jobId && <> This attempt is saved in the <Link className="underline" href={`/admin/questions/import/${failure.jobId}`}>import history</Link>.</>}</p>
        </div>
      )}

      {phase.kind !== "idle" && (
        <div role="status" className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full bg-brand-teal transition-all ${phase.kind === "checking" ? "animate-pulse" : ""}`} style={{ width: phase.kind === "uploading" ? `${phase.percent}%` : "100%" }} />
          </div>
          <p className="mt-2 text-sm text-slate-700">{phase.kind === "uploading" ? `Uploading… ${phase.percent}%` : "Checking every question against the curriculum…"}</p>
        </div>
      )}

      <button type="button" onClick={() => void analyze()} disabled={busy || !file} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">
        {busy ? "Please wait…" : "Upload and check"}
      </button>
    </div>
  );
}
