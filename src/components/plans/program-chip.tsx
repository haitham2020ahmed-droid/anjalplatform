"use client";
import { useT } from "@/i18n/client";
import type { Program } from "@/server/plans/program";

/** One color per program, the same everywhere: MAP green, RTI orange, Curriculum blue, NAFS teal (custom: grey, enrichment: amber). */
export const PROGRAM_CHIP: Record<Program | "CUSTOM" | "ENRICHMENT", { label: string; className: string }> = {
  MAP: { label: "MAP", className: "bg-green-100 text-green-900 ring-green-300" },
  RTI: { label: "RTI", className: "bg-orange-100 text-orange-900 ring-orange-300" },
  CURRICULUM: { label: "Curriculum", className: "bg-blue-100 text-blue-900 ring-blue-300" },
  NAFS: { label: "NAFS", className: "bg-teal-100 text-teal-900 ring-teal-300" },
  CUSTOM: { label: "Custom", className: "bg-slate-100 text-slate-800 ring-slate-300" },
  ENRICHMENT: { label: "Enrichment", className: "bg-amber-100 text-amber-900 ring-amber-300" },
};

/**
 * The small program tag (use programOf(assignment) or programOfPlanKind(kind) for the value; null = Custom).
 * `kind` is additive: pass a plan's raw SkillPlan.kind too (when known) so an Enrichment plan (program null,
 * same safe bucket as Custom) still shows its own amber chip instead of the generic grey "Custom" one.
 */
export function ProgramChip({ program, kind, className = "" }: { program: Program | null | undefined; kind?: string | null; className?: string }) {
  const t = useT();
  const key = kind === "ENRICHMENT" ? "ENRICHMENT" : program ?? "CUSTOM";
  const c = PROGRAM_CHIP[key] ?? PROGRAM_CHIP.CUSTOM;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.className} ${className}`}>{t(c.label)}</span>;
}
