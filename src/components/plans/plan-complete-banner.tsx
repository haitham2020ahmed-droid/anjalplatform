"use client";
/**
 * 🎉 Plan-completion celebration (My Plans): a bigger, livelier banner than a single skill's "Great job!" screen —
 * shown on a plan's card once every one of its parts is done. The big confetti version shows once per plan per
 * device (localStorage, never a server write: it is a pure presentation touch, like the mute switch); after that the
 * card still carries a quiet "✓ Plan complete" badge so the result is never lost, just not re-celebrated forever.
 */
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { CelebrateFx } from "../feedback-fx/answer-fx";

export function PlanCompleteBanner({ planKey }: { planKey: string }) {
  const t = useT();
  const [big, setBig] = useState(false);
  useEffect(() => {
    try {
      const key = `plan-complete-seen:${planKey}`;
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
      setBig(true);
    } catch { setBig(true); } // no storage (private window): celebrate anyway, just every visit
  }, [planKey]);
  if (!big) {
    return (
      <p data-testid="plan-complete-badge" className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
        <span aria-hidden="true">✅</span>{t("Plan complete")}
      </p>
    );
  }
  return (
    <div data-testid="plan-complete-banner" role="status" aria-live="polite" className="relative overflow-hidden rounded-2xl bg-gradient-to-r bg-linear-to-r from-amber-100 via-amber-50 to-white px-4 py-4 text-center ring-1 ring-amber-300">
      <p className="text-2xl font-extrabold text-amber-900">{t("Plan complete! 🎉")}</p>
      <p className="mt-1 text-sm text-amber-800">{t("You finished every part of this plan — amazing work!")}</p>
      <div className="mt-2"><CelebrateFx /></div>
    </div>
  );
}
