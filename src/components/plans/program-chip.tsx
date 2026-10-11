"use client";
import { useT } from "@/i18n/client";
import type { Program } from "@/server/plans/program";

/** One color per program, the same everywhere: MAP green, RTI orange, Curriculum blue, NAFS teal (custom: grey). */
export const PROGRAM_CHIP: Record<Program | "CUSTOM", { label: string; className: string }> = {
  MAP: { label: "MAP", className: "bg-green-100 text-green-900 ring-green-300" },
  RTI: { label: "RTI", className: "bg-orange-100 text-orange-900 ring-orange-300" },
  CURRICULUM: { label: "Curriculum", className: "bg-blue-100 text-blue-900 ring-blue-300" },
  NAFS: { label: "NAFS", className: "bg-teal-100 text-teal-900 ring-teal-300" },
  CUSTOM: { label: "Custom", className: "bg-slate-100 text-slate-800 ring-slate-300" },
};

/** The small program tag (use programOf(assignment) or programOfPlanKind(kind) for the value; null = Custom). */
export function ProgramChip({ program, className = "" }: { program: Program | null | undefined; className?: string }) {
  const t = useT();
  const c = PROGRAM_CHIP[program ?? "CUSTOM"] ?? PROGRAM_CHIP.CUSTOM;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${c.className} ${className}`}>{t(c.label)}</span>;
}
