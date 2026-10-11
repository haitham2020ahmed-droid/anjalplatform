"use client";
import { useT } from "@/i18n/client";
import { TAG_STYLE, tagKey, type TagKey } from "./tokens";

/**
 * Small coloured tag for where work comes from (Curriculum / MAP / RTI / Grammar / NAFS) or a test's type
 * (NAFS, MAP, Diagnostic, Weekly Quiz, Chapter Test, or the teacher's own name → grey "custom").
 * `grade` adds the skill's grade (e.g. "G6") for cross-grade assigning.
 */
export function SourceTag({ source, label, grade, icon = false, size = "sm", className = "" }: { source: TagKey | string; label?: string; grade?: number | string | null; icon?: boolean; size?: "sm" | "md"; className?: string }) {
  const t = useT();
  const key = tagKey(source);
  const st = TAG_STYLE[key];
  // a teacher's own test name ("Reading Check 3") is shown as typed, in the grey custom colour
  const named = key === "CUSTOM" && String(source).trim().toUpperCase() !== "CUSTOM";
  const text = label ?? (named ? String(source) : t(st.label));
  return (
    <span data-source={key} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold ring-1 ${size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"} ${st.className} ${className}`}>
      {icon && <span aria-hidden="true">{st.icon}</span>}
      <bdi>{text}</bdi>
      {grade !== undefined && grade !== null && grade !== "" && <span className="opacity-70">· G{grade}</span>}
    </span>
  );
}
