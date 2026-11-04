"use client";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { LineIcon } from "./line-icon";

/** Dyslexia-friendly font: wider letter shapes (Lexend) and extra letter/word spacing in reading content
 * (remembered on this device, same pattern as ComfortToggle — a separate switch, so a student can use either or
 * both at once). */
export function DyslexicFontToggle() {
  const t = useT();
  const [on, setOn] = useState(false);
  useEffect(() => { let v = ""; try { v = window.localStorage.getItem("anjal.dyslexicFont") ?? ""; } catch { /* ignore */ } setOn(v === "1"); document.documentElement.dataset.dyslexicFont = v === "1" ? "1" : ""; }, []);
  const flip = () => { const v = !on; setOn(v); document.documentElement.dataset.dyslexicFont = v ? "1" : ""; try { window.localStorage.setItem("anjal.dyslexicFont", v ? "1" : ""); } catch { /* ignore */ } };
  return <button type="button" onClick={flip} aria-pressed={on} title={t("Dyslexia-friendly font")} aria-label={t("Dyslexia-friendly font")} className={`min-h-11 min-w-11 rounded-lg px-2 py-1 ${on ? "bg-amber-100 text-amber-900" : "text-slate-600 hover:bg-slate-100"}`}><LineIcon name="words" className="h-5 w-5" /></button>;
}
