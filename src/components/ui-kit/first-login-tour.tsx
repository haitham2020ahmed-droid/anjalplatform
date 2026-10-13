"use client";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";

export interface TourStep { target: string; icon: string; title: string; text: string }

/** 3–4 short tips per role, pointing at the main buttons (elements with a matching data-tour attribute). */
export const TOUR_STEPS: Record<string, TourStep[]> = {
  STUDENT: [
    { target: "my-work", icon: "📘", title: "My Work", text: "Everything your teacher gives you is in My Work. Tap Start on the first row." },
    { target: "plans", icon: "🗺️", title: "MAP", text: "Your MAP scores, your goal and your MAP practice." },
    { target: "tests", icon: "📝", title: "My Tests", text: "Tests to do and tests you finished are in My Tests." },
    { target: "lang", icon: "🌐", title: "Language", text: "Parents: tap the language button at the top to read the menus in Arabic. Lessons and questions stay in English." },
  ],
  TEACHER: [
    { target: "students", icon: "👥", title: "My Classes", text: "Your classes, student lists, accounts and each student’s page are in My Classes." },
    { target: "plans", icon: "🗂️", title: "Plans", text: "Every plan is in Plans: MAP, NAFS, Curriculum, Support, Test and your own." },
    { target: "teacher-reports", icon: "📊", title: "Reports", text: "Every report about your students is in Reports." },
    { target: "home", icon: "🏠", title: "Your home page", text: "Tap Home at the top of any page to come back here. You can never get lost." },
  ],
  ADMIN: [
    { target: "content", icon: "📚", title: "Content", text: "Questions, Curriculum Map, Grammar and ReadMaster are under Content." },
    { target: "reports", icon: "📊", title: "Reports", text: "Department Week, reports to approve and the school reports are under Reports." },
    { target: "all-tools", icon: "🧰", title: "All Admin Tools", text: "Every admin page is in All Admin Tools: type a word to find it." },
    { target: "home", icon: "🏠", title: "Your home page", text: "Tap Home at the top of any page to come back here. You can never get lost." },
  ],
};
export const tourStepsFor = (role: string): TourStep[] => TOUR_STEPS[role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" ? "ADMIN" : role] ?? [];

/** The first VISIBLE element marked data-tour="<target>" (a home tile first, else the menu item). */
function findTarget(target: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * First-login tour: shown once per user (the server decides `open`), with Skip. Finishing or skipping is saved
 * on the user (POST /api/tour). Window event "open-tour" replays it at any time. Works in English and Arabic.
 */
export function FirstLoginTour({ role, open: initiallyOpen }: { role: string; open: boolean }) {
  const t = useT();
  const steps = tourStepsFor(role);
  const [step, setStep] = useState<number | null>(initiallyOpen && steps.length ? 0 : null);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    // closed a moment ago on another page (the save may still be on its way): do not open again
    try { if (window.sessionStorage.getItem("anjal.tour.done")) setStep(null); } catch { /* private mode */ }
  }, []);

  useEffect(() => {
    const replay = () => setStep(0);
    window.addEventListener("open-tour", replay);
    return () => window.removeEventListener("open-tour", replay);
  }, []);

  const place = useCallback(() => {
    if (step === null) return;
    const el = findTarget(steps[step].target);
    document.querySelectorAll("[data-tour-on]").forEach((x) => x.removeAttribute("data-tour-on"));
    if (!el) { setBox(null); return; }
    el.setAttribute("data-tour-on", "1");
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { el.scrollIntoView({ block: "center" }); }
    const q = el.getBoundingClientRect();
    setBox({ top: q.top, left: q.left, width: q.width, height: q.height });
  }, [step, steps]);

  useEffect(() => { if (mounted) place(); }, [place, mounted]);
  useEffect(() => {
    if (step === null) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [step, place]);

  const close = () => {
    document.querySelectorAll("[data-tour-on]").forEach((x) => x.removeAttribute("data-tour-on"));
    setStep(null);
    try { window.sessionStorage.setItem("anjal.tour.done", "1"); } catch { /* private mode */ }
    void fetch("/api/tour", { method: "POST" }).catch(() => undefined);
  };
  useEffect(() => {
    if (step === null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  if (!mounted || step === null || !steps.length) return null;
  const s = steps[step], last = step === steps.length - 1;
  // card below the target when there is room, else above; centred when the target is not on screen
  const vw = window.innerWidth, vh = window.innerHeight;
  const W = Math.min(360, vw - 24);
  let style: React.CSSProperties = { width: W, left: (vw - W) / 2, top: Math.max(12, vh / 2 - 140) };
  if (box) {
    const left = Math.min(Math.max(12, box.left + box.width / 2 - W / 2), vw - W - 12);
    const below = box.top + box.height + 14;
    style = below + 240 < vh ? { width: W, left, top: below } : { width: W, left, top: Math.max(12, box.top - 254) };
  }
  return (
    <div className="fixed inset-0 z-[70] print:hidden" role="dialog" aria-modal="true" aria-label={t("Welcome tour")}>
      <div className="absolute inset-0 bg-slate-900/45" onClick={close} aria-hidden="true" />
      {box && <div aria-hidden="true" className="pointer-events-none absolute rounded-2xl ring-4 ring-brand-gold transition-all" style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12, boxShadow: "0 0 0 9999px rgba(15,23,42,.25)" }} />}
      <div className="animate-fade-up absolute rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-200" style={style}>
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-4xl">{s.icon}</span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-brand-navy">{t(s.title)}</h2>
            <p className="mt-1 text-base text-slate-700">{t(s.text)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-500">{t("Tip {n} of {total}", { n: step + 1, total: steps.length })}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={close} className="min-h-11 rounded-xl px-4 font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">{t("Skip")}</button>
          {last ? <button type="button" onClick={close} autoFocus className="min-h-11 rounded-xl bg-emerald-600 px-5 font-semibold text-white">{t("Let’s start!")}</button>
            : <button type="button" onClick={() => setStep(step + 1)} autoFocus className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("Next")} <span aria-hidden="true" className="inline-block rtl:rotate-180">▶</span></button>}
        </div>
      </div>
    </div>
  );
}

/** A small button that replays the tour (e.g. on the Help page or a home page). */
export function TourButton({ className = "" }: { className?: string }) {
  const t = useT();
  return <button type="button" onClick={() => window.dispatchEvent(new Event("open-tour"))} className={`min-h-11 rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-200 ${className}`}>❔ {t("Tour")}</button>;
}
