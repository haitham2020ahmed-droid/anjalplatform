"use client";
/** Prints the plan (the browser's “Save as PDF” makes the file to download and send). */
export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">⬇ Download PDF / 🖨 Print</button>;
}
