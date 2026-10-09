"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Every form on the platform answers at once: the pressed button shows a spinner (“working…”) until the page
 * comes back, and a second press is ignored (no double sends). Works for all existing forms without changing them.
 */
export function SubmitFeedback() {
  const path = usePathname(), sp = useSearchParams();
  useEffect(() => {
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      // only forms that send something to the server (POST, or a server action); filters / searches (GET) and
      // forms handled inside the page are left alone
      const serverAction = Boolean(form.querySelector('input[name^="$ACTION"]')) || (form.getAttribute("action") ?? "").startsWith("javascript:");
      if (form.method?.toLowerCase() !== "post" && !serverAction) return;
      if (form.dataset.busy === "1") { e.preventDefault(); e.stopPropagation(); return; }
      form.dataset.busy = "1";
      const btn = (e.submitter as HTMLElement | null) ?? form.querySelector<HTMLElement>("button:not([type=button])");
      btn?.classList.add("is-busy");
      btn?.setAttribute("aria-busy", "true");
      // safety: give the form back after 6 s (e.g. a file download or an action that does not navigate)
      window.setTimeout(() => { delete form.dataset.busy; btn?.classList.remove("is-busy"); btn?.removeAttribute("aria-busy"); }, 6_000);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  // a new page (or the same page with a message) arrived: clear every busy button
  useEffect(() => {
    document.querySelectorAll<HTMLFormElement>("form[data-busy]").forEach((f) => delete f.dataset.busy);
    document.querySelectorAll(".is-busy").forEach((b) => { b.classList.remove("is-busy"); b.removeAttribute("aria-busy"); });
  }, [path, sp]);
  return null;
}
