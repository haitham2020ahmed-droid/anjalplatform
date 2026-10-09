"use client";
import { useEffect, useState } from "react";

const STEPS = [
  { icon: "📘", title: "My work", text: "The tasks from your teacher are here. Start with “Next up”. Numbers on the icons show what is left to do (red = late or due today)." },
  { icon: "🗺️", title: "My MAP", text: "Your MAP results, your goal (how many RIT points are left) and your MAP plan. Practise the first area first." },
  { icon: "📖", title: "Words", text: "Double-click any word in a reading to see its meaning. It goes into “My words” for a weekly quiz." },
  { icon: "🔁", title: "Review", text: "Questions you got wrong come back later so you really learn them." },
  { icon: "🎯", title: "Goals", text: "Set your goal for the week and watch your class goal grow together." },
];
const KEY = "anjal.tour.v1";

/** First sign-in: a short tour of the student's home (shown once on this device; reopen with “Tour”). */
export function StudentTour() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => { let seen = "1"; try { seen = window.localStorage.getItem(KEY) ?? ""; } catch { /* private mode */ } if (!seen) setStep(0); }, []);
  const close = () => { try { window.localStorage.setItem(KEY, "1"); } catch { /* ignore */ } setStep(null); };
  if (step === null) return <button type="button" onClick={() => setStep(0)} className="fixed bottom-4 end-4 z-30 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-navy shadow-lg ring-1 ring-slate-200 print:hidden">❔ Tour</button>;
  const s = STEPS[step];
  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome tour" className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-2xl">
        <p className="text-5xl" aria-hidden="true">{s.icon}</p>
        <h2 className="mt-2 text-2xl font-extrabold text-brand-navy">{s.title}</h2>
        <p className="mt-2 text-lg text-slate-700">{s.text}</p>
        <p className="mt-3 text-sm text-slate-400">{step + 1} / {STEPS.length}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={close} className="rounded-xl px-4 py-2 font-semibold text-slate-600 ring-1 ring-slate-300">Skip</button>
          {step < STEPS.length - 1 ? <button type="button" onClick={() => setStep(step + 1)} className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white">Next ▶</button>
            : <button type="button" onClick={close} className="rounded-xl bg-emerald-600 px-5 py-2 font-semibold text-white">Let’s start! 🚀</button>}
        </div>
      </div>
    </div>
  );
}
