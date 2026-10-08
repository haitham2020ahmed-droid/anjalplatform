"use client";
import { useEffect } from "react";
/** Opens the print / “Save as PDF” dialog once the page is shown (…?print=1). */
export function AutoPrint() {
  useEffect(() => { const t = setTimeout(() => window.print(), 400); return () => clearTimeout(t); }, []);
  return null;
}
