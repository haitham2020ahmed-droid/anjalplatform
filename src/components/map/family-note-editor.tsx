import { saveMapFamilyNoteAction } from "@/app/map-report/actions";

/**
 * ✏️ Edit before Send: the teacher's own words for this student's MAP Family Report — the one part of the report
 * that is not computed straight from the MAP data. Staff only, never printed; the family sees it as "A note from
 * your teacher" once the report is sent (Reports hub → Send to family).
 */
export function FamilyNoteEditor({ studentId, name, note, msg }: { studentId: string; name: string; note: string | null; msg?: string }) {
  return (
    <form action={saveMapFamilyNoteAction} className="mx-auto mb-5 max-w-4xl rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden">
      <input type="hidden" name="studentId" value={studentId} />
      <label htmlFor="map-family-note" className="block text-sm font-bold text-brand-navy">✏️ Edit before sending — a note for {name}&apos;s family</label>
      <p className="mt-0.5 text-xs text-slate-500">This is read with the report; everything else (the scores and growth) comes straight from the MAP data and cannot be changed here.</p>
      <textarea id="map-family-note" name="note" defaultValue={note ?? ""} rows={3} maxLength={1000}
        placeholder="e.g. Great progress on vocabulary this term — let's keep up 15 minutes of reading a night."
        className="mt-2 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
      <div className="mt-2 flex items-center gap-3">
        <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">💾 Save</button>
        <span className="text-xs text-slate-500">Saved here, then sent with the report ("Send to family" above).</span>
      </div>
      {msg && <p role="status" className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">{msg}</p>}
    </form>
  );
}
