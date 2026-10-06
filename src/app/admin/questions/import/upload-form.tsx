"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { field, label } from "@/components/admin/styles";

type Grade = { level: number; skills: { id: string; code: string; name: string }[] };

/** Drag-and-drop upload; the server detects the format and analyzes the questions. */
export function ImportUpload({ grades, aiReady }: { grades: Grade[]; aiReady: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [grade, setGrade] = useState(grades[0]?.level ?? 4);
  const [skillId, setSkillId] = useState("");
  const [useAi, setUseAi] = useState(aiReady);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skills = grades.find((g) => g.level === grade)?.skills ?? [];

  async function analyze() {
    if (!file) return setError("Choose a file first.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("gradeLevel", String(grade));
    if (skillId) fd.set("skillId", skillId);
    if (useAi) fd.set("useAi", "1");
    try {
      const res = await fetch("/api/question-imports", { method: "POST", body: fd });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? "The file could not be analyzed.");
      router.push(`/admin/questions/import/${data.jobId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="button" tabIndex={0} aria-label="Choose or drop a question-bank file"
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = (e as unknown as { dataTransfer: DataTransfer }).dataTransfer.files[0]; if (f) setFile(f); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center ${over ? "border-brand-teal bg-teal-50" : "border-slate-300 bg-slate-50"}`}
      >
        <p className="text-lg font-semibold text-brand-navy">{file ? file.name : "Drop a file here, or click to choose"}</p>
        <p className="mt-1 text-sm text-slate-600">{file ? `${(file.size / 1024).toFixed(0)} KB` : "CSV, Excel (.xlsx), Word (.docx), PDF, JSON or TXT · up to 10 MB"}</p>
        <input ref={input} type="file" accept=".csv,.tsv,.xlsx,.docx,.pdf,.json,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>Grade (when the file does not say)<select className={field} value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setSkillId(""); }}>{grades.map((g) => <option key={g.level} value={g.level}>Grade {g.level}</option>)}</select></label>
        <label className={label}>Default skill (optional)<select className={field} value={skillId} onChange={(e) => setSkillId(e.target.value)}><option value="">— detect from the file —</option>{skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={useAi} disabled={!aiReady} onChange={(e) => setUseAi(e.target.checked)} />Use AI to read unusual layouts and map skills{!aiReady && " (not set up)"}</label>
      </div>
      <p className="text-xs text-slate-500">Before anything is sent to the AI, the names, usernames and student numbers of your school’s students are removed from the text.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
      <button type="button" onClick={analyze} disabled={busy || !file} className="rounded-xl bg-brand-navy px-6 py-2.5 font-semibold text-white hover:bg-brand-purple disabled:opacity-60">{busy ? "Reading and analyzing the file…" : "Analyze file"}</button>
    </div>
  );
}
