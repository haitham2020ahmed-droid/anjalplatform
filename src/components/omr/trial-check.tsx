"use client";
import { useMemo, useRef, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import type { OmrResult } from "@/lib/omr/read";
import { compareTrial, trialLayout, TRIAL_HOW, type TrialCheck as Check } from "@/lib/omr/trial";
import { SheetScanner } from "@/components/omr/sheet-scanner";
import { SheetConfidenceNote } from "@/components/nafs/grade-sheets";

const L = ["A", "B", "C", "D"];

/**
 * 🧪 Check a photo of the filled trial sheet: read in the browser (never uploaded, never saved), compared with the
 * printed key — RIGHT, ASKED TO CHECK (the reader did not guess) or WRONG — with the sheet's confidence.
 */
export function TrialCheck({ scannerLabels }: { scannerLabels: Record<string, string> }) {
  const t = useT();
  const layout = useMemo(() => trialLayout(), []);
  const [res, setRes] = useState<{ check: Check; r: OmrResult; preview: string } | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); }, []);
  const onSheet = (r: OmrResult, preview: string) => { urls.current.push(preview); setRes({ check: compareTrial(r), r, preview }); };
  const c = res?.check;
  const how = (h: keyof typeof TRIAL_HOW) => (h === "FILL" ? "" : ` · ${t(h === "ERASE_CHANGE" ? "erase and change" : h === "TWO" ? "two marks" : h === "LIGHT" ? "light" : "empty")}`);
  return (
    <div className="grid gap-4">
      <SheetScanner layout={layout} onSheet={onSheet} labels={scannerLabels} />
      {c && !c.ok && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t(c.error === "TOO_BLURRY" ? "The photo is too blurry: hold the phone still and try again." : c.error === "WRONG_SHEET" ? "This is not a sheet of this test." : "No corner markers found: take the photo again with the whole sheet in view.")}</p>}
      {c && c.ok && res && (
        <section aria-label={t("Trial result")} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={res.preview} alt={t("The scanned sheet")} className="max-h-[70vh] w-full rounded-xl object-contain ring-1 ring-line" />
          <div>
            <p className={`rounded-xl px-4 py-3 text-base font-semibold ring-1 ${c.wrong ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"}`} role="status">
              {t("{r} of {n} read as the key", { r: c.right, n: c.rows.length })} · {t("{c} asked to check", { c: c.checked })} · {t("{w} read wrongly", { w: c.wrong })}
            </p>
            {res.r.quality && <SheetConfidenceNote q={res.r.quality} unresolved={res.r.quality.check.length} />}
            {!c.codeOk && <p className="mt-2 text-sm text-amber-800">{t("The sheet code was not read: the code strip may be covered or folded.")}</p>}
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-start text-xs text-muted"><th className="py-1 text-start">#</th><th className="text-start">{t("Key")}</th><th className="text-start">{t("Read")}</th><th className="text-start">{t("Result")}</th></tr></thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.q} className={`border-t border-line ${r.verdict === "WRONG" ? "bg-rose-50" : r.verdict === "CHECKED" ? "bg-amber-50" : ""}`}>
                    <td className="py-1 tabular-nums">{r.q}</td>
                    <td>{r.expected === null ? "—" : L[r.expected]}<span className="text-xs text-muted">{how(r.how)}</span></td>
                    <td>{r.status === "OK" && r.read !== null ? L[r.read] : r.status === "BLANK" ? "—" : t(r.status === "MULTIPLE" ? "More than one mark" : "Check")}</td>
                    <td className="font-semibold">{r.verdict === "RIGHT" ? `✓ ${t("Right")}` : r.verdict === "CHECKED" ? t("Asked to check") : `✗ ${t("Wrong")}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
