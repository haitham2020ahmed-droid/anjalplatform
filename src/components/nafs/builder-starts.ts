/**
 * 🇸🇦 The ONE NAFS test builder's three starts (shared by the Tests tab and the builder; plain data, no client code):
 * the old six ways (Complete NAFS test · NAFS simulation · Ministry booklet model · Automatic · Manual · AI) are these
 * three starts plus the builder's options and its "add" sources.
 */
import { codeName } from "@/server/nafs/framework";

export type BuilderStart = "BOOKLET" | "ALL" | "CHOOSE";

/** A checklist group (a Ministry content area or a NAFS domain) and its items, each a code WITH its name. */
export interface ChecklistGroup { key: string; label: string; items: { code: string; label: string }[] }

export const STARTS: { key: BuilderStart; icon: string; title: string; text: string }[] = [
  { key: "BOOKLET", icon: "📘", title: "A model booklet", text: "One of the model booklets as it is (or fewer questions picked by the standards) — choose one, or a random one." },
  { key: "ALL", icon: "★", title: "All 13 standards — complete test", text: "Every Ministry standard in the guide's proportions, an informational and a literary text, the PIRLS processes; you check the coverage before saving." },
  { key: "CHOOSE", icon: "✔", title: "Choose standards / skills myself", text: "Tick standards or NAFS skills: balanced over your choice, or shaped like the real booklet. Or add questions one by one." },
];

/** The start a saved test's mode belongs to (a Ministry model without a booklet is the complete test). */
export function startOfMode(mode: string | null | undefined, settings?: Record<string, unknown> | null): BuilderStart {
  if (mode === "FULL") return "ALL";
  if (mode === "MINISTRY") return settings && typeof settings.booklet === "string" && settings.booklet ? "BOOKLET" : "ALL";
  return "CHOOSE";
}

/** The center's checklist groups: the three Ministry content areas (each standard with its name) and the NAFS domains. */
export function nafsGroups(input: { areas: { code: string; name: string }[]; standards: { code: string; area: string }[]; domains: { code: string; name: string }[]; skills: { code: string; domain: string; name: string }[] }, t: (s: string) => string, withSkills = true): ChecklistGroup[] {
  return [
    ...input.areas.map((a) => ({ key: a.code, label: a.name, items: input.standards.filter((x) => x.area === a.code).map((x) => ({ code: x.code, label: codeName(x.code, t) })) })),
    ...(withSkills ? input.domains.map((d) => ({ key: d.code, label: d.name, items: input.skills.filter((k) => k.domain === d.code).map((k) => ({ code: k.code, label: codeName(k.code, t) })) })).filter((g) => g.items.length) : []),
  ];
}
