"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useT } from "@/i18n/client";
import type { TFn } from "@/i18n";
import type { QuickAssignSkillInput } from "@/app/admin/curriculum-map/actions";
import type { RosterClass } from "./assign-button";
import type { MapPdfSection, MapPdfSkill, MapPdfUnit } from "@/server/curriculum-map/map-pdf";
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
  /** skill ids that already have an open assignment in one of these classes (owner: keep the ⭐ after a refresh) */
  assigned?: ReadonlySet<string>;
  /** ⭐ whether the CHOSEN class already has this skill assigned — the "assign it again?" prompt in SuggestPanel */
  priorAssignment?: (input: { classId: string; skillId: string }) => Promise<{ assigned: boolean }>;
  /** ⭐ how many students in the CHOSEN class already mastered this skill — the "exclude them?" prompt in SuggestPanel */
  masteredCount?: (input: { classId: string; skillId: string }) => Promise<{ count: number }>;
}

export function SkillPlan({ basePath, grade, grades, unitIx, units, pdfHref, studentPdfHref, reportHref, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount }: SkillPlanProps) {
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
                  <UnitSection key={`${unit.number}-${sec.number}`} sec={sec} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} />
                ))}
                {unit.writing.length > 0 && (
                  <div className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{t("Unit writing")}</p>
                    <SkillGroups skills={unit.writing} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} />
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

function UnitSection({ sec, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount }: { sec: MapPdfSection; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; assigned?: ReadonlySet<string>; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"] }) {
  const t = useT();
  const pending = sec.pending ?? [];
  return (
    <div className="px-5 py-4">
      <p className="font-semibold text-slate-900" dir="ltr">
        {weeksLabel(sec, t)}
        {sec.essentialQuestion ? `: ${sec.essentialQuestion}` : sec.title ? `: ${sec.title}` : ""}
      </p>
      {sec.essentialQuestion && sec.title && <p className="text-sm text-slate-500" dir="ltr">{sec.title}</p>}
      {sec.skills.length === 0 && pending.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">{t("No platform skills linked yet.")}</p>
      ) : (
        <>
          <SkillGroups skills={sec.skills} canAssign={canAssign} roster={roster} quickAssign={quickAssign} assigned={assigned} priorAssignment={priorAssignment} masteredCount={masteredCount} />
          <PendingSkills names={pending} t={t} />
        </>
      )}
    </div>
  );
}

/**
 * 🔗 r85: skill names the Lessons tab shows for this selection (the school's own Curriculum Map) that have no
 * platform Skill linked yet — plain text, not clickable or ⭐-assignable, so Skill plan and Lessons always name the
 * same selections and the same skills, even for content nobody has built questions for yet.
 */
function PendingSkills({ names, t }: { names: string[]; t: TFn }) {
  if (!names.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm font-bold text-amber-700">⏳ {t("In the lesson plan, not yet on the platform")}</p>
      <ul className="mt-1 space-y-1">
        {names.map((n) => (
          <li key={n} className="flex items-center gap-2 rounded-xl bg-amber-50/60 px-3 py-1.5 text-sm text-slate-600 ring-1 ring-amber-100">
            <bdi dir="ltr" className="truncate">{n}</bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}

function weeksLabel(sec: Pick<MapPdfSection, "weeks" | "number">, t: TFn): string {
  const ws = [...sec.weeks].sort((a, b) => a - b);
  if (ws.length >= 2) return t("Weeks {a} and {b}", { a: ws[0], b: ws[ws.length - 1] });
  if (ws.length === 1) return t("Week {a}", { a: ws[0] });
  return t("Selection {n}", { n: sec.number });
}

function SkillGroups({ skills, canAssign, roster, quickAssign, assigned, priorAssignment, masteredCount }: { skills: MapPdfSkill[]; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; assigned?: ReadonlySet<string>; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"] }) {
  const t = useT();
  if (!skills.length) return null; // the caller (UnitSection) decides what to show instead: pending names or "No platform skills linked yet."
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
              {ks.map((k) => <SkillRow key={k.id} n={++n} skill={k} canAssign={canAssign} roster={roster} quickAssign={quickAssign} initDone={assigned?.has(k.id) ?? false} priorAssignment={priorAssignment} masteredCount={masteredCount} />)}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function SkillRow({ n, skill, canAssign, roster, quickAssign, initDone, priorAssignment, masteredCount }: { n: number; skill: MapPdfSkill; canAssign: boolean; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; initDone: boolean; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"] }) {
  const [open, setOpen] = useState(false);
  // starts from the server's own record (assignedSkillIds) so a refresh keeps showing ⭐ for a skill really assigned,
  // not just this tab's fleeting click
  const [done, setDone] = useState(initDone);
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
      {open && canAssign && <SuggestPanel skill={skill} roster={roster} quickAssign={quickAssign} priorAssignment={priorAssignment} masteredCount={masteredCount} anchorRef={starRef} onDone={() => setDone(true)} onClose={() => setOpen(false)} />}
    </li>
  );
}

function SuggestPanel({ skill, roster, quickAssign, priorAssignment, masteredCount, anchorRef, onDone, onClose }: { skill: MapPdfSkill; roster: RosterClass[]; quickAssign: SkillPlanProps["quickAssign"]; priorAssignment?: SkillPlanProps["priorAssignment"]; masteredCount?: SkillPlanProps["masteredCount"]; anchorRef: RefObject<HTMLButtonElement | null>; onDone: () => void; onClose: () => void }) {
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
  const klass = roster.find((c) => c.id === classId) ?? roster[0];
  const students = useMemo(() => (klass?.students ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [klass, q]);
  // 📍 anchored right above the ⭐ that opened this panel (not a page-centered modal). Computed in JS from the
  // star's actual on-screen position (position: fixed) rather than CSS `absolute`, because the card around the
  // skill list clips overflow for its rounded corners — an `absolute` popover would get silently cut off for rows
  // near the top of that card. boxRef lets an outside click close it, since there is no full-screen backdrop any more.
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const bottom = Math.max(8, window.innerHeight - r.top + 8); // 8px gap above the star
      setPos({ left, bottom, width });
    };
    reposition();
    // keeps the panel glued to the star while the page (or a scrollable list inside it) moves — capture:true also
    // catches scroll events from a nested scrollable container, which don't bubble up to window on their own
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, { capture: true });
      window.removeEventListener("resize", reposition);
    };
  }, [anchorRef]);
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
  return (
    <div ref={boxRef} role="dialog" aria-modal="true" aria-label={t("Suggest this skill to:")}
      style={pos ? { position: "fixed", left: pos.left, bottom: pos.bottom, width: pos.width, visibility: "visible" } : { position: "fixed", visibility: "hidden" }}
      className="z-50 max-h-[70vh] overflow-y-auto rounded-2xl bg-white p-4 text-start text-sm normal-case shadow-xl ring-1 ring-slate-200">
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
