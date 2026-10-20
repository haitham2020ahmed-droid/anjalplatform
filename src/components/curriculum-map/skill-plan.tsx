"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import type { TFn } from "@/i18n";
import type { QuickAssignSkillInput } from "@/app/admin/curriculum-map/actions";
import { MapAssignButton, type RosterClass } from "./assign-button";
import type { MapPdfLessonSection, MapPdfSection, MapPdfSkill, MapPdfUnit } from "@/server/curriculum-map/map-pdf";
import { SourceSelect } from "@/components/assign/source-select";
import type { AssignSource } from "@/lib/assign-source";
import { PriorAssignedPrompt } from "@/components/assign/prior-assigned";
import { ExcludeMasteredPrompt } from "@/components/assign/exclude-mastered";

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
 *
 * 🔗 r86 (owner: "حول Concept Vocabulary / Analyze Craft and Structure زي Lessons بالظبط، بنفس ربط الأسئلة، مع
 * الإبقاء على الجرامر"): Concept Vocabulary and Analyze Craft and Structure are no longer the numbered, ⭐-starred
 * platform Skill rows below — those two categories are dropped from CATEGORY_ORDER entirely and shown instead, per
 * selection, as `sec.lessonSections` (LessonSectionRows): the exact same Concept Vocabulary / Analyze Craft and
 * Structure / Review rows the Lessons tab lists, with the same Ready/Not ready, 👁 Review and ⭐ Assign (a
 * CurriculumMapNode place, already linked to real questions — src/components/curriculum-map/lesson-card.tsx's
 * CompactLesson, which these rows deliberately mirror). Grammar and punctuation (and Writing, Spelling & word
 * study) are untouched: the Curriculum Map has no such categories at all, so they stay the platform's own Skills.
 */
const CATEGORY_LABEL: Record<string, string> = { "word-study": "Spelling and word study", writing: "Writing", grammar: "Grammar and punctuation" };
const CATEGORY_ORDER = ["word-study", "writing", "grammar"];

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
  /** skill ids that already have an open assignment in one of these classes (owner: keep the ⭐ after a refresh) */
  assigned?: ReadonlySet<string>;
  /** ⭐ whether the CHOSEN class already has this skill assigned — the "assign it again?" prompt in SuggestPanel */
  priorAssignment?: (input: { classId: string; skillId: string }) => Promise<{ assigned: boolean }>;
  /** ⭐ how many students in the CHOSEN class already mastered this skill — the "exclude them?" prompt in SuggestPanel */
  masteredCount?: (input: { classId: string; skillId: string }) => Promise<{ count: number }>;
  /** ⭐ un-star: cancel every open assignment of this skill for the CHOSEN class (students keep their answers) */
  cancelAssignment?: (input: { classId: string; skillId: string }) => Promise<{ ok: boolean; message: string }>;
}

export function SkillPlan({ basePath, grade, grades, unitIx, units, pdfHref, studentPdfHref, reportHref, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount, cancelAssignment }: SkillPlanProps) {
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
                  <UnitSection key={`${unit.number}-${sec.number}`} sec={sec} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} cancelAssignment={cancelAssignment} />
                ))}
                {unit.writing.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{t("Unit writing")}</p>
                    <SkillGroups skills={unit.writing} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} cancelAssignment={cancelAssignment} />
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

function UnitSection({ sec, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount, cancelAssignment }: { sec: MapPdfSection; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; assigned?: ReadonlySet<string>; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"]; cancelAssignment?: SkillPlanProps["cancelAssignment"] }) {
  const t = useT();
  // a selection with no platform skills linked yet (no "No platform skills linked yet." placeholder row any more —
  // owner: "شيل ده خالص" / "حذف اي شي زي كده" — it just doesn't appear in the Skill plan at all)
  if (sec.skills.length === 0 && !sec.lessonSections?.length) return null;
  return (
    <div className="px-5 py-4">
      <p className="font-semibold text-slate-900" dir="ltr">
        {weeksLabel(sec, t)}
        {sec.essentialQuestion ? `: ${sec.essentialQuestion}` : sec.title ? `: ${sec.title}` : ""}
      </p>
      {sec.essentialQuestion && sec.title && <p className="text-sm text-slate-500" dir="ltr">{sec.title}</p>}
      {sec.lessonSections?.length ? <LessonSectionRows sections={sec.lessonSections} canAssign={canAssign} roster={roster} /> : null}
      <SkillGroups skills={sec.skills} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} cancelAssignment={cancelAssignment} />
    </div>
  );
}

function weeksLabel(sec: Pick<MapPdfSection, "weeks" | "number">, t: TFn): string {
  const ws = [...sec.weeks].sort((a, b) => a - b);
  if (ws.length >= 2) return t("Weeks {a} and {b}", { a: ws[0], b: ws[ws.length - 1] });
  if (ws.length === 1) return t("Week {a}", { a: ws[0] });
  return t("Selection {n}", { n: sec.number });
}

/**
 * 🔗 r86: Concept Vocabulary / Analyze Craft and Structure / Review, exactly as the Lessons tab lists and assigns
 * them — same titles, same Ready/Not ready, same 👁 Review / ✏️ My Review / ⭐ Assign. Deliberately mirrors
 * CompactLesson's row markup (src/components/curriculum-map/lesson-card.tsx) so it reads as the SAME feature, not a
 * lookalike: these rows assign the CurriculumMapNode place itself (code), not a platform Skill.
 */
function LessonSectionRows({ sections, canAssign, roster }: { sections: MapPdfLessonSection[]; canAssign: boolean; roster: RosterClass[] }) {
  const t = useT();
  const pill = "inline-flex min-h-8 items-center rounded-full px-2.5 text-xs font-bold ring-1";
  return (
    <ul className="mt-2 divide-y divide-slate-100">
      {sections.map((s) => (
        <li key={s.code} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <span className="text-sm font-medium text-slate-800" dir="ltr">{s.title}</span>
          <span className="flex flex-wrap items-center gap-1">
            {!s.ready && <span className={`${pill} bg-slate-100 text-slate-500 ring-slate-200`}>{t("Not ready")}</span>}
            {s.ready && <Link href={`/teacher/preview?code=${encodeURIComponent(s.code)}`} prefetch={false} className={`${pill} bg-white text-brand-navy ring-slate-300 hover:bg-slate-50`}>👁 {t("Review")}</Link>}
            {canAssign && s.kind === "REVIEW" && <Link href={`/teacher/curriculum-review?code=${encodeURIComponent(s.code)}`} prefetch={false} className={`${pill} bg-violet-50 text-violet-900 ring-violet-200 hover:bg-violet-100`}>✏️ {t("My Review")}</Link>}
            {canAssign && s.ready && roster.length > 0 && <MapAssignButton code={s.code} label={t("Assign")} levels />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SkillGroups({ skills, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount, cancelAssignment }: { skills: MapPdfSkill[]; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; assigned?: ReadonlySet<string>; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"]; cancelAssignment?: SkillPlanProps["cancelAssignment"] }) {
  const t = useT();
  if (!skills.length) return null; // the caller (UnitSection) decides what to show instead: lessonSections or nothing at all
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
              {ks.map((k) => <SkillRow key={k.id} n={++n} skill={k} canAssign={canAssign} roster={roster} quickAssign={quickAssign} initDone={assigned?.has(k.id) ?? false} priorAssignment={priorAssignment} masteredCount={masteredCount} cancelAssignment={cancelAssignment} />)}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function SkillRow({ n, skill, canAssign, roster, quickAssign, initDone, priorAssignment, masteredCount, cancelAssignment }: { n: number; skill: MapPdfSkill; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; initDone: boolean; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"]; cancelAssignment?: SkillPlanProps["cancelAssignment"] }) {
  const [open, setOpen] = useState(false);
  // starts from the server's own record (assignedSkillIds) so a refresh keeps showing ⭐ for a skill really assigned,
  // not just this tab's fleeting click
  const [done, setDone] = useState(initDone);
  // ⭐ un-star ("لو شلت النجمه يتلغي"): after a successful remove, SuggestPanel calls router.refresh(), which
  // recomputes `assigned` on the server and hands this row a fresh `initDone` — but useState only reads its
  // argument on the FIRST render, so without this sync the star would stay filled until a full page reload even
  // though the assignment really is gone. Keeps the star honest in both directions (assign AND remove).
  useEffect(() => setDone(initDone), [initDone]);
  // 📍 the star's own on-screen position, so the suggest panel opens right above THIS star, not centered on the page
  const starRef = useRef<HTMLButtonElement>(null);
  return (
    <li className="relative">
      <div className="flex items-start gap-2 py-0.5">
        {canAssign && roster.length > 0 && (
          <button ref={starRef} type="button" aria-expanded={open} aria-label="Assign" onClick={() => setOpen((v) => !v)}
            className="mt-0.5 shrink-0 text-base leading-none transition active:scale-90" title="Assign">
            {done ? "⭐" : "☆"}
          </button>
        )}
        <span className="shrink-0 text-sm text-slate-500">{n}.</span>
        <Link href={`/teacher/skill-assign?skillId=${encodeURIComponent(skill.id)}${roster[0] ? `&classId=${encodeURIComponent(roster[0].id)}` : ""}`} prefetch={false}
          className="text-sm font-medium text-blue-800 hover:underline" dir="ltr">{skill.name}</Link>
      </div>
      {open && canAssign && <SuggestPanel skill={skill} roster={roster} quickAssign={quickAssign} priorAssignment={priorAssignment} masteredCount={masteredCount} cancelAssignment={cancelAssignment} onDone={() => setDone(true)} onRemoved={() => setDone(false)} onClose={() => setOpen(false)} />}
    </li>
  );
}

function SuggestPanel({ skill, roster, quickAssign, priorAssignment, masteredCount, cancelAssignment, onDone, onRemoved, onClose }: { skill: MapPdfSkill; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"]; cancelAssignment?: SkillPlanProps["cancelAssignment"]; onDone: () => void; onRemoved: () => void; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [classId, setClassId] = useState(roster[0]?.id ?? "");
  const [source, setSource] = useState<AssignSource | "">("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  // ⭐ "already assigned to this class — assign it again?" (owner: the same question the full Assign-a-skill page
  // asks, now asked here too): re-checked whenever the chosen class changes, reset on every class switch so a
  // confirm for one class never silently carries over to another.
  const [priorAssigned, setPriorAssigned] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // 🐛 fix (owner: "I press All students, only the message shows, no ⭐ on the students"): quickAssign's success
  // calls router.refresh(), which hands this panel a NEW `priorAssignment` function reference — that alone reruns
  // the "already assigned?" effect below (it is in the dependency array), and since the skill genuinely IS now
  // assigned, priorAssigned flips true right away. Without this flag, `blocked` would then swap the whole student
  // list for the "assign it again?" prompt the instant the assign succeeds — the ⭐s WERE set correctly, they were
  // just immediately hidden behind that prompt. justAssigned suppresses the prompt for the rest of this panel's
  // life for the chosen class, since we already know first-hand we are not duplicating anything by mistake.
  const [justAssigned, setJustAssigned] = useState(false);
  // ⭐ "N students already mastered this skill — exclude them?" (the same question the Find-a-skill dialog and the
  // full Assign page ask) — advisory, not blocking: a teacher who ignores it just assigns to everyone, as before.
  const [mastered, setMastered] = useState(0);
  const [exclude, setExclude] = useState<boolean | null>(null);
  // ⭐ un-star ("لو شلت النجمه يتلغي"): a small, separate "Remove this assignment" action — not the Yes/No of
  // PriorAssignedPrompt above (that one only answers "assign it again or not"; it never deletes anything). Offered
  // only once priorAssigned is known true for the CHOSEN class, with its own confirm step so nothing is cancelled
  // from a single click.
  const [removeStep, setRemoveStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);
  const klass = roster.find((c) => c.id === classId) ?? roster[0];
  const students = useMemo(() => (klass?.students ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [klass, q]);
  // 🎯 owner r87 ("باظت... خليها ثابته"): three rounds of "anchor the panel to the ⭐ that opened it" (clamp to
  // the edge → hide while scrolled off-screen → flip above/below by the panel's real height) each fixed one case
  // and broke another, because the star keeps moving under a `position: fixed` panel computed from a snapshot of
  // its coordinates — any scroll, or the page's own layout shifting as other sections load, makes that snapshot
  // stale. A FIXED spot removes the whole class of bug at the root: the panel always opens in the same safe,
  // centered place on screen, never computed from the star's position, never needs to re-track scroll. A dimmed
  // backdrop (click it, or Escape, to close) makes it obvious which skill it belongs to even without an arrow
  // pointing at a star — the skill's own name is right there in the panel's header.
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [onClose]);
  // Escape closes the window, same as every other assign dialog on the platform
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    let live = true;
    setConfirmed(false);
    setRemoveStep("idle");
    setRemoveMsg(null);
    if (!priorAssignment || !classId) { setPriorAssigned(false); return; }
    priorAssignment({ classId, skillId: skill.id }).then((r) => { if (live) setPriorAssigned(r.assigned); }).catch(() => undefined);
    return () => { live = false; };
  }, [classId, skill.id, priorAssignment]);
  useEffect(() => {
    let live = true;
    setExclude(null);
    if (!masteredCount || !classId) { setMastered(0); return; }
    masteredCount({ classId, skillId: skill.id }).then((r) => { if (live) setMastered(r.count); }).catch(() => undefined);
    return () => { live = false; };
  }, [classId, skill.id, masteredCount]);
  const blocked = priorAssigned && !confirmed && !justAssigned;
  const run = async (studentIds: string[] | undefined, key: string) => {
    if (!source) { setMsg(t("Choose the source first.")); return; }
    setBusy(key); setMsg(null);
    // "exclude mastered" only makes sense for "All students": a click on one named student is already an explicit choice
    const r = await quickAssign({ classId, skillId: skill.id, source, studentIds, ...(key === "all" ? { excludeMastered: exclude === true } : {}) });
    setBusy(null);
    // "All students": mark every student in the class (not just the ones currently matching the search box), so the
    // list shows ⭐ throughout, not only on the "All students" row itself
    // r## fix: `useRouter` was imported but never called — the ⭐ was only ever set from this tab's own click
    // (onDone/setStarred, both client-only state), so the page's own server-read "assigned" record (assignedSkillIds)
    // was never asked to refresh. router.refresh() re-reads it now, so the star is backed by the real saved record
    // the moment the assign succeeds, not just until the next full reload.
    if (r.ok) { onDone(); setJustAssigned(true); setStarred((s) => new Set([...s, ...(studentIds ?? (klass?.students ?? []).map((x) => x.id))])); setMsg(t("Assigned ✓")); router.refresh(); } else setMsg(r.message);
  };
  // ⭐ un-star ("لو شلت النجمه يتلغي"): cancels every open assignment of this skill for the CHOSEN class. A
  // confirm step (removeStep "confirm" → "busy") so nothing is cancelled from the single star click that opened
  // this panel — the person must open this panel AND explicitly confirm "Remove" before anything changes.
  const removeNow = async () => {
    if (!cancelAssignment) return;
    setRemoveStep("busy"); setRemoveMsg(null);
    const r = await cancelAssignment({ classId, skillId: skill.id });
    if (r.ok) { onRemoved(); setPriorAssigned(false); setConfirmed(false); setJustAssigned(false); setRemoveStep("idle"); setRemoveMsg(t("Removed ✓")); router.refresh(); }
    else { setRemoveStep("idle"); setRemoveMsg(r.message); }
  };
  return (
    // 🎯 owner r87 ("خليها بنفس شكل المنصه... فقط المكان"): same card look as before (white, rounded, ring, shadow)
    // — only the POSITION changed, to a fixed spot near the top of the screen that never depends on the ⭐'s own
    // coordinates, so it can't drift off after a scroll or a layout shift the way the anchored version did.
    <div ref={boxRef} role="dialog" aria-modal="true" aria-label={t("Suggest this skill to:")}
      className="fixed inset-x-0 top-20 z-50 mx-auto max-h-[70vh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl bg-white p-4 text-start text-sm normal-case shadow-xl ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-brand-navy">{t("Suggest this skill to:")}</p>
          <p className="mt-0.5 text-xs text-slate-500" dir="ltr">{skill.name}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("Close")} className="text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
      </div>
      {roster.length > 1 && (
        <select value={classId} onChange={(e) => { setClassId(e.target.value); setStarred(new Set()); setJustAssigned(false); }} className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold">
          {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {/* ⭐ un-star ("لو شلت النجمه يتلغي"): offered only once this class is known to already have the skill
          assigned — separate from the Yes/No below, which only decides whether to assign it AGAIN, never deletes. */}
      {cancelAssignment && priorAssigned && (
        removeStep === "confirm" ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-2.5 py-2 text-xs text-rose-950 ring-1 ring-rose-200">
            <p>{t("Remove this assignment for {class}? Students stop seeing it; answers already given are kept.", { class: klass?.name ?? "" })}</p>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" disabled={(removeStep as string) === "busy"} onClick={removeNow} className="rounded-md bg-rose-700 px-2 py-0.5 font-semibold text-white disabled:opacity-50">{t("Remove")}</button>
              <button type="button" onClick={() => setRemoveStep("idle")} className="rounded-md bg-white px-2 py-0.5 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Cancel")}</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={removeStep === "busy"} onClick={() => setRemoveStep("confirm")} className="mt-2 text-xs font-semibold text-rose-700 underline disabled:opacity-50">
            {removeStep === "busy" ? "⏳" : "🗑"} {t("Remove this assignment")}
          </button>
        )
      )}
      {removeMsg && <p role="status" className="mt-1.5 text-xs font-medium text-rose-700">{removeMsg}</p>}
      <SourceSelect t={t} value={source} onChange={setSource} className="mt-3" compact field="rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
      {blocked ? (
        <div className="mt-3"><PriorAssignedPrompt t={t} onYes={() => setConfirmed(true)} onNo={onClose} /></div>
      ) : (
        <>
          {mastered > 0 && !msg && (exclude === null
            ? <div className="mt-3"><ExcludeMasteredPrompt count={mastered} t={t} onYes={() => setExclude(true)} onNo={() => setExclude(false)} /></div>
            : <p className="mt-3 text-xs text-slate-600">⭐ {exclude ? t("Students who mastered this skill are left out.") : t("Students who mastered this skill get it too.")} <button type="button" onClick={() => setExclude(null)} className="font-semibold text-brand-teal underline">{t("Change")}</button></p>)}
          <div className="relative mt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search students")} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 pe-7 text-sm" />
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
          </div>
          <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto">
            <li>
              <button type="button" disabled={busy !== null || !source} onClick={() => run(undefined, "all")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start font-semibold hover:bg-slate-50 disabled:opacity-50">
                <span aria-hidden="true">{busy === "all" ? "⏳" : (klass?.students.length ?? 0) > 0 && (klass?.students ?? []).every((x) => starred.has(x.id)) ? "⭐" : "☆"}</span> {t("All students")}
              </button>
            </li>
            {students.map((s) => (
              <li key={s.id}>
                <button type="button" disabled={busy !== null || !source} onClick={() => run([s.id], s.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-slate-50 disabled:opacity-50">
                  <span aria-hidden="true">{busy === s.id ? "⏳" : starred.has(s.id) ? "⭐" : "☆"}</span> <span className="truncate">{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {msg && <p role="status" className="mt-2 text-xs font-medium text-emerald-700">{msg}</p>}
    </div>
  );
}
