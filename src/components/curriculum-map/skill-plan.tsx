"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { TFn } from "@/i18n";
import type { QuickAssignSkillInput } from "@/app/admin/curriculum-map/actions";
import type { RosterClass } from "./assign-button";
import type { MapPdfSection, MapPdfSkill, MapPdfUnit } from "@/server/curriculum-map/map-pdf";

/**
 * 🗺️ The "skill plan" look of the Curriculum Map (owner: a reference screenshot of another platform's skill-plan
 * page — grade picker, a unit sidebar, each Text Set's week(s) and essential question, its skills grouped under
 * Vocabulary / Comprehension / Spelling & word study / Writing / Grammar, numbered, each with a ⭐ that opens a small
 * "suggest to students" panel right above it). Grades 4, 5 and 6 all use this same component — only the data
 * (units/grade) changes.
 *
 * Read-only for admins (no stars); teachers get the ⭐ quick-assign (one named skill, adaptive, a class or a few
 * starred students — src/app/admin/curriculum-map/actions.ts#quickAssignSkillAction). A teacher who wants levels,
 * dates or a chosen question set still has each skill's "More options" into the full /teacher/skill-assign page.
 */
const CATEGORY_LABEL: Record<string, string> = { vocabulary: "Vocabulary", comprehension: "Comprehension", "word-study": "Spelling and word study", writing: "Writing", grammar: "Grammar and punctuation" };
const CATEGORY_ORDER = ["vocabulary", "comprehension", "word-study", "writing", "grammar"];

export interface SkillPlanProps {
  basePath: string; // e.g. "/admin/curriculum-map"
  grade: number;
  grades: number[];
  unitIx: number;
  units: MapPdfUnit[];
  pdfHref: string;
  studentPdfHref: string;
  reportHref: string | null;
  canAssign: boolean;
  roster: RosterClass[];
  quickAssign: (input: QuickAssignSkillInput) => Promise<{ ok: boolean; message: string }>;
}

export function SkillPlan({ basePath, grade, grades, unitIx, units, pdfHref, studentPdfHref, reportHref, canAssign, roster, quickAssign }: SkillPlanProps) {
  const t = useT();
  const router = useRouter();
  const unit = units[unitIx] as MapPdfUnit | undefined;
  const gradeLink = (g: number) => `${basePath}?grade=${g}`;
  const unitLink = (g: number, i: number) => `${basePath}?grade=${g}&unit=${i + 1}`;
  return (
    <div className="curriculum-map-ui">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-navy to-brand-purple px-4 py-3 text-white shadow-sm">
        {grades.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <span className="sr-only">{t("Grade")}</span>
            <select value={grade} onChange={(e) => router.push(gradeLink(Number(e.target.value)))}
              className="rounded-full border-0 bg-white px-4 py-2 font-bold text-brand-navy shadow focus:outline-none focus:ring-2 focus:ring-white">
              {grades.map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}
            </select>
          </label>
        ) : <span className="rounded-full bg-white px-4 py-2 font-bold text-brand-navy">{t("Grade {n}", { n: grade })}</span>}
        <div className="flex flex-wrap gap-2">
          {reportHref && <Link href={reportHref} prefetch={false} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/40 hover:bg-white/25">📈 {t("View report")}</Link>}
          <a href={pdfHref} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy shadow hover:bg-slate-50">🖨 {t("Print skill plan")}</a>
        </div>
      </div>

      {units.length > 0 && (
        <div className="mt-4 flex flex-col gap-4 lg:flex-row">
          <nav aria-label={t("Units")} className="shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200 lg:w-48">
            <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("Jump to:")}</p>
            <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {units.map((u, i) => (
                <li key={u.number}>
                  <Link href={unitLink(grade, i)} prefetch={false} aria-current={i === unitIx ? "page" : undefined}
                    className={`block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${i === unitIx ? "bg-brand-purple text-white shadow" : "text-slate-700 hover:bg-slate-50"}`}>
                    {t("Unit {n}", { n: u.number })}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {unit && (
            <div className="min-w-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 bg-gradient-to-r from-brand-purple/90 to-brand-navy px-5 py-4 text-white">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-extrabold">{unit.number}</span>
                <h2 className="text-lg font-extrabold">{t("Unit {n}", { n: unit.number })}</h2>
                <span className="truncate text-sm text-white/80" dir="ltr">{unit.title}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {unit.sections.map((sec) => (
                  <UnitSection key={`${unit.number}-${sec.number}`} sec={sec} canAssign={canAssign} roster={roster} quickAssign={quickAssign} />
                ))}
                {unit.writing.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{t("Unit writing")}</p>
                    <SkillGroups skills={unit.writing} canAssign={canAssign} roster={roster} quickAssign={quickAssign} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-end text-xs text-slate-400"><a href={studentPdfHref} className="hover:underline">{t("Students' copy")}</a></p>
    </div>
  );
}

function UnitSection({ sec, canAssign, roster, quickAssign }: { sec: MapPdfSection; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"] }) {
  const t = useT();
  return (
    <div className="px-5 py-4">
      <p className="font-semibold text-slate-900" dir="ltr">
        {weeksLabel(sec, t)}
        {sec.essentialQuestion ? `: ${sec.essentialQuestion}` : sec.title ? `: ${sec.title}` : ""}
      </p>
      {sec.essentialQuestion && sec.title && <p className="text-sm text-slate-500" dir="ltr">{sec.title}</p>}
      <SkillGroups skills={sec.skills} canAssign={canAssign} roster={roster} quickAssign={quickAssign} />
    </div>
  );
}

function weeksLabel(sec: Pick<MapPdfSection, "weeks" | "number">, t: TFn): string {
  const ws = [...sec.weeks].sort((a, b) => a - b);
  if (ws.length >= 2) return t("Weeks {a} and {b}", { a: ws[0], b: ws[ws.length - 1] });
  if (ws.length === 1) return t("Week {a}", { a: ws[0] });
  return t("Selection {n}", { n: sec.number });
}

function SkillGroups({ skills, canAssign, roster, quickAssign }: { skills: MapPdfSkill[]; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"] }) {
  const t = useT();
  if (!skills.length) return <p className="mt-2 text-sm text-slate-400">{t("No platform skills linked yet.")}</p>;
  let n = 0;
  return (
    <div className="mt-2 space-y-3">
      {CATEGORY_ORDER.map((key) => {
        const ks = skills.filter((k) => k.group === key);
        if (!ks.length) return null;
        return (
          <div key={key}>
            <p className="text-sm font-bold text-brand-purple">{t(CATEGORY_LABEL[key])}</p>
            <ol className="mt-1 space-y-1">
              {ks.map((k) => <SkillRow key={k.id} n={++n} skill={k} canAssign={canAssign} roster={roster} quickAssign={quickAssign} />)}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function SkillRow({ n, skill, canAssign, roster, quickAssign }: { n: number; skill: MapPdfSkill; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"] }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <li className="relative">
      <div className="flex items-start gap-2 py-0.5">
        {canAssign && roster.length > 0 && (
          <button type="button" aria-expanded={open} aria-label="Assign" onClick={() => setOpen((v) => !v)}
            className="mt-0.5 shrink-0 text-base leading-none transition active:scale-90" title="Assign">
            {done ? "⭐" : "☆"}
          </button>
        )}
        <span className="shrink-0 text-sm text-slate-500">{n}.</span>
        <Link href={`/teacher/skill-assign?skillId=${encodeURIComponent(skill.id)}${roster[0] ? `&classId=${encodeURIComponent(roster[0].id)}` : ""}`} prefetch={false}
          className="text-sm font-medium text-blue-800 hover:underline" dir="ltr">{skill.name}</Link>
      </div>
      {open && canAssign && <SuggestPanel skill={skill} roster={roster} quickAssign={quickAssign} onDone={() => setDone(true)} onClose={() => setOpen(false)} />}
    </li>
  );
}

function SuggestPanel({ skill, roster, quickAssign, onDone, onClose }: { skill: MapPdfSkill; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; onDone: () => void; onClose: () => void }) {
  const t = useT();
  const [classId, setClassId] = useState(roster[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const klass = roster.find((c) => c.id === classId) ?? roster[0];
  const students = useMemo(() => (klass?.students ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [klass, q]);
  const run = async (studentIds: string[] | undefined, key: string) => {
    setBusy(key); setMsg(null);
    const r = await quickAssign({ classId, skillId: skill.id, studentIds });
    setBusy(null);
    if (r.ok) { onDone(); if (studentIds) setStarred((s) => new Set([...s, ...studentIds])); setMsg(t("Assigned ✓")); } else setMsg(r.message);
  };
  return (
    <div role="dialog" aria-label="Suggest this skill to" className="absolute bottom-full start-6 z-20 mb-1 w-72 rounded-2xl bg-white p-3 text-start text-sm normal-case shadow-xl ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-brand-navy">{t("Suggest this skill to:")}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="text-lg leading-none text-slate-400 hover:text-slate-600">×</button>
      </div>
      {roster.length > 1 && (
        <select value={classId} onChange={(e) => { setClassId(e.target.value); setStarred(new Set()); }} className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold">
          {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="relative mt-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search students")} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 pe-7 text-sm" />
        <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
      </div>
      <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
        <li>
          <button type="button" disabled={busy !== null} onClick={() => run(undefined, "all")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start font-semibold hover:bg-slate-50 disabled:opacity-50">
            <span aria-hidden="true">{busy === "all" ? "⏳" : "☆"}</span> {t("All students")}
          </button>
        </li>
        {students.map((s) => (
          <li key={s.id}>
            <button type="button" disabled={busy !== null} onClick={() => run([s.id], s.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50 disabled:opacity-50">
              <span aria-hidden="true">{busy === s.id ? "⏳" : starred.has(s.id) ? "⭐" : "☆"}</span> <span className="truncate">{s.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {msg && <p role="status" className="mt-1 text-xs font-medium text-emerald-700">{msg}</p>}
    </div>
  );
}
