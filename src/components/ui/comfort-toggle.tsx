"use client";
import { useEffect, useState } from "react";

/** Aa — comfortable reading: bigger text, more space, a warm background (remembered on this device). */
export function ComfortToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => { let v = ""; try { v = window.localStorage.getItem("anjal.comfort") ?? ""; } catch { /* ignore */ } setOn(v === "1"); document.documentElement.dataset.comfort = v === "1" ? "1" : ""; }, []);
  const flip = () => { const v = !on; setOn(v); document.documentElement.dataset.comfort = v ? "1" : ""; try { window.localStorage.setItem("anjal.comfort", v ? "1" : ""); } catch { /* ignore */ } };
  return <button type="button" onClick={flip} aria-pressed={on} title="Comfortable reading: bigger text" className={`rounded-lg px-2 py-1 text-sm font-bold ${on ? "bg-amber-100 text-amber-900" : "text-slate-600 hover:bg-slate-100"}`}>Aa</button>;
}
