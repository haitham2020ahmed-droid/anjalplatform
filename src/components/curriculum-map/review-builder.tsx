"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { CustomReviewView, ReviewSetUnit, ReviewSkillUnit, WrittenQuestion } from "@/server/curriculum-map/review-control";
import type { MapSourceQuestion } from "@/server/tests/map-source";
import type { SkillFamily } from "@/server/teacher/home";
import {
  customBankAction, customDeleteArchiveAction, customDetailAction, customDraftAction, customEditAction, customOptionsBulkAction, customReviewAssignAction, customReviewChangeAction,
  customSetChoicesAction, customSkillChoicesAction, customWriteAction, setPreviewAction, skillPreviewAction,
} from "@/app/teacher/review-builder/actions";
// 🔎 the SAME cross-grade "Find a skill and assign it" search the teacher already knows from the Teacher Home page
// (findSkillFamilies in src/server/teacher/home.ts) — reused here as-is, not rebuilt, per the audit's "doesn't have
// access to all the skills on the platform" finding: "Or browse by skill" below only lists THIS grade's plan.
import { findSkillsAction } from "@/app/teacher/home-actions";
import { RichInline } from "@/components/rich-inline";
import { SourceSelect } from "@/components/assign/source-select";
import type { AssignSource } from "@/lib/assign-source";
import type { RosterClass } from "./assign-button";
import { PrintButton } from "@/components/plans/print-button";
import { loadSkillQuestions } from "@/components/skill-picker/load";
import { filterQuestions, isCorrectChoice, LEVEL_FILTERS, type LevelFilter as PickerLevelFilter, type PickerQuestion } from "@/components/skill-picker/helpers";

const PICKER_LV: Record<PickerLevelFilter, string> = { ALL: "All levels", BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };

const btn = "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-50";
const main = "inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white disabled:opacity-50";
const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
type Edit = { id: string; type: string; stem: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[] };
const blank = (): WrittenQuestion => ({ stem: "", options: ["", "", "", ""], correct: 0 });
type Level = "ABOVE" | "ON" | "BELOW";
type LevelFilter = Level | "ANY";
const LV: Record<Level, string> = { ABOVE: "Exceeding", ON: "Meeting", BELOW: "Approaching" };
type Cat = "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "REVIEW";
const CAT_LABEL: Record<Cat, string> = { CONCEPT_VOCABULARY: "Vocabulary", ANALYZE_CRAFT_AND_STRUCTURE: "Analyze Craft", REVIEW: "Review" };

/**
 * 🔁 r90/r91 Review Builder: a Review not tied to one Text Set. ✏️ Edit (a private copy), ➕ Write a question,
 * 🔎 search the bank, ✨ AI draft to check first, and two bulk collectors — 🗂️ "Text Sets" (any unit, any Set, a
 * ☐ tick per category) and 🗣️ "Language" (any Skill of the grade's plan, with a 👁 preview) — all respecting an
 * optional level filter, then ↕ reorder / ➖ remove (with a "Removed from my Review" put-back list) / 🔢 how
 * many, then ⭐ Assign it directly (Fixed or Adaptive).
 */
export function ReviewBuilder({ grade, rev, initial, sets, skillUnits, roster }: {
  // 📦 fix (Oct 2026, "اقدر ارجع لي القديم"): `rev` is set only when opening an ARCHIVED Review Builder (one saved
  // with "💾 Save & start new") instead of the live one for this grade — every action below is passed through to
  // the matching saved row, and the "💾 Save & start new"/🗑 buttons are hidden here (it's already archived).
  grade: number; rev?: string; initial: CustomReviewView; sets: ReviewSetUnit[]; skillUnits: ReviewSkillUnit[]; roster: RosterClass[];
}) {
  const t = useT();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [count, setCount] = useState(String(initial.count));
  const [tab, setTab] = useState<"" | "sets" | "skills" | "write" | "bank">("");
  const [level, setLevel] = useState<LevelFilter>("ANY");
  const [setsData, setSetsData] = useState<ReviewSetUnit[] | null>(sets.length ? sets : null);
  const [skillsData, setSkillsData] = useState<ReviewSkillUnit[] | null>(skillUnits.length ? skillUnits : null);
  const [skillQ, setSkillQ] = useState("");
  const [setPicks, setSetPicks] = useState<Record<string, Set<Cat>>>({});
  // 🔔 fix (Oct 2026, "لو اخترتها تاني تظهر تنبيه"): same as the Language tab's addedSkillIds below — which
  // "{unit}.{setNumber}.{category}" picks were already added via "Add selected" THIS visit.
  const [addedSetCats, setAddedSetCats] = useState<Set<string>>(new Set());
  const [skillPicks, setSkillPicks] = useState<Set<string>>(new Set());
  // 🔔 fix (Oct 2026, "لو اخترتها تاني تظهر تنبيه"): skills already added via "Add selected" THIS visit — ticking
  // one of them again shows a warning instead of silently re-queuing it, since re-adding it usually finds "nothing
  // new" (every question of that skill is already in the Review).
  const [addedSkillIds, setAddedSkillIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ id: string; stems: string[] } | null>(null);
  // 👁 r91 "Text Sets" tab preview, keyed by "{unit}.{setNumber}.{category}"
  const [tsPreview, setTsPreview] = useState<{ key: string; stems: string[] } | null>(null);
  // 🔎 r91 "From the bank" tab: browse one skill's own questions, like the teacher's other assign screens
  const [bankSkillsData, setBankSkillsData] = useState<ReviewSkillUnit[] | null>(skillUnits.length ? skillUnits : null);
  const [openSkill, setOpenSkill] = useState<string>("");
  const [skillQs, setSkillQs] = useState<{ id: string; list: PickerQuestion[] | null }>({ id: "", list: null });
  const [skillLv, setSkillLv] = useState<PickerLevelFilter>("ALL");
  const [skillSearch, setSkillSearch] = useState("");
  // 🔎 fix (audit finding, Oct 2026): "Find any skill (all grades)" — same cross-grade search as Teacher Home,
  // feeding the SAME open/expand panel as "Or browse by skill" below (openSkill/skillQs/skillLv/skillSearch).
  const [bankSkillQ, setBankSkillQ] = useState("");
  const [foundSkills, setFoundSkills] = useState<SkillFamily[] | null>(null);
  const runSkillSearch = (e?: FormEvent) => { e?.preventDefault(); go(async () => { setFoundSkills(await findSkillsAction(bankSkillQ, grade)); }); };
  // ➕ r91 "Or browse by skill": the small "add N questions of this skill at once" dialog
  const [bulkDialog, setBulkDialog] = useState<{ id: string; name: string } | null>(null);
  const [bulkCount, setBulkCount] = useState("5");
  const [bulkLv, setBulkLv] = useState<PickerLevelFilter>("ALL");
  // ✏️ r91 Edit a question (my private copy) · ➕ Write · 🔎 bank search
  const [edit, setEdit] = useState<Edit | null>(null);
  const [w, setW] = useState<WrittenQuestion>(blank());
  const [q, setQ] = useState("");
  const [bank, setBank] = useState<MapSourceQuestion[] | null>(null);
  // 🐛 fix (audit finding, Oct 2026): the bank search used to cap at the first 20 results with no way to see the
  // rest. This tracks the last search's paging so "next page"/"previous page" can re-run it with `page` set.
  const [bankPage, setBankPage] = useState<{ mine: boolean; page: number; pages: number; total: number } | null>(null);
  const runBankSearch = (opts: { mine?: boolean; page?: number } = {}) => go(async () => {
    const mine = opts.mine ?? false;
    const r = await customBankAction(mine ? { mine: true, page: opts.page } : { q, page: opts.page });
    if (r.ok) { setBank(r.value.rows); setBankPage({ mine, page: r.value.page, pages: r.value.pages, total: r.value.total }); }
    else setMsg({ ok: false, text: r.message });
  });
  // ⭐ assign mini-form
  const [classId, setClassId] = useState(roster[0]?.id ?? "");
  const [mode, setMode] = useState<"FIXED" | "ADAPTIVE">("FIXED");
  const [target, setTarget] = useState("20");
  const [source, setSource] = useState<AssignSource | "">("");
  const [title, setTitle] = useState("Review");
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (r: { ok: true; value: CustomReviewView } | { ok: false; message: string }, done?: string) => {
    if (r.ok) { setV(r.value); setCount(String(r.value.count)); setSectionInputs({}); if (done) setMsg({ ok: true, text: done }); } else setMsg({ ok: false, text: r.message });
    return r.ok;
  };
  const go = (fn: () => Promise<unknown>) => start(async () => { setMsg(null); await fn(); });
  const ids = v.questions.map((x) => x.id);
  // 🗂️ fix (Oct 2026, "التوزيع"): collapsed section panel — each section shown as one row (name, available, how
  // many are taken) instead of the full question list sprawled out; 👁 peeks at the first couple of stems, opening
  // the row shows every question of that section with the usual Edit/Remove. Per-section "take" is editable by
  // hand (Save → "sectionCounts"), independent of the flat "Number of questions" total above (which auto-spreads
  // proportionally across every section — see review-control.ts).
  const [peekSection, setPeekSection] = useState<string>("");
  const [openSection, setOpenSection] = useState<string>("");
  // 🔄 fix (Oct 2026, "ضيف خيار ان المعلم يقدر يبدل السؤال"): which ASKED question's swap picker is open
  // ({sectionLabel, questionId}) — "⚡ Automatic" or pick one of the section's own SPARE questions to swap in.
  const [swapFor, setSwapFor] = useState<{ label: string; id: string } | null>(null);
  // 📋 fix (Oct 2026, "عايز تيوب فيها كل ١٥١ سوال"): a flat, ungrouped-by-collapse view of every CURRENTLY TAKEN
  // question (grouped only under its section's heading, always expanded) — for reviewing/editing all of them at
  // once and for a clean, professional print (the per-section accordion above prints empty/collapsed sections
  // unless each is opened by hand first).
  const [flatView, setFlatView] = useState(false);
  // 👁 fix (Oct 2026, "خيار عين تظهر الاجابه"): the choices of every TAKEN question, keyed by id — fetched once (all
  // 151 in one round trip) the first time the flat view opens, and refreshed after any edit/remove/swap made from
  // it; `showAnswers` just toggles the ✓ correct-choice marker on/off (on-screen AND in the printed page, which
  // prints the DOM exactly as it stands when "Print" is pressed).
  const [flatOptions, setFlatOptions] = useState<Record<string, { type: string; options: { label: string; text: string; correct: boolean }[]; answer: boolean | null; answers: string[]; passageTitle: string | null; passageText: string | null }>>({});
  const [showAnswers, setShowAnswers] = useState(false);
  const loadFlatOptions = async (idList: string[]) => {
    const r = await customOptionsBulkAction(grade, idList, rev);
    if (r.ok) setFlatOptions((p) => ({ ...p, ...r.value }));
  };
  const [sectionInputs, setSectionInputs] = useState<Record<string, string>>({});
  const sectionValue = (label: string, take: number) => sectionInputs[label] ?? String(take);
  // 🐛 fix (Oct 2026, "لازم امشي واحد واحد واضغط save"): used to fall back to the server's last-SAVED `sec.take` for
  // every section except the one just clicked — so typing new numbers into several rows and saving only one row
  // silently wiped the others' not-yet-saved numbers back to their old value the moment `apply()` cleared
  // `sectionInputs`. Falls back to the CURRENTLY TYPED value (sectionValue) instead, so every row's Save button now
  // submits every row's in-progress edits at once — type into as many rows as you like, one Save is enough.
  const saveSectionCounts = (overrides: Record<string, number> = {}) => go(async () => {
    const counts: Record<string, number> = {};
    for (const sec of v.sections) counts[sec.label] = overrides[sec.label] ?? Number(sectionValue(sec.label, sec.take));
    apply(await customReviewChangeAction(grade, { op: "sectionCounts", counts }, rev), t("Saved ✓"));
  });
  // 🔀 fix (Oct 2026, "لما اختار Meeting يظهر جزء خاص بيه"): matches the server's sectionGroupLabel (see
  // review-control.ts) — a question's raw `.section` stays unchanged everywhere else on the platform, but on THIS
  // screen a section not already level-specific (Vocabulary/Review) is shown split by level, so matching a
  // question to its row needs the same level-aware label the server used to build `v.sections`.
  const LEVEL_TITLES = new Set(Object.values(LV));
  const fineLabel = (section: string, lvl: string) => {
    const parts = section.split(" · ");
    if (LEVEL_TITLES.has(parts[parts.length - 1])) return section;
    const suffix = LV[lvl as Level];
    return suffix ? `${section} · ${suffix}` : section;
  };
  const questionsOf = (label: string) => v.questions.filter((x) => fineLabel(x.section, x.level) === label);
  // 🔎 Level dropdown now also filters which section rows are SHOWN (not just what gets added): pick "Meeting" to
  // see only that level's rows, each with its own "Take" to set and save independently of the other levels.
  const visibleSections = level === "ANY" ? v.sections : v.sections.filter((sec) => sec.label.endsWith(` · ${LV[level]}`));

  const setKey = (unit: number, setNumber: number) => `${unit}.${setNumber}`;
  const toggleSetCat = (unit: number, setNumber: number, cat: Cat) => {
    const key = setKey(unit, setNumber);
    setSetPicks((s) => { const n = { ...s }; const cur = new Set(n[key] ?? []); if (cur.has(cat)) cur.delete(cat); else cur.add(cat); if (cur.size) n[key] = cur; else delete n[key]; return n; });
  };
  const setPicksCount = Object.values(setPicks).reduce((n, s) => n + s.size, 0);

  // 🔎 one expandable skill row (level filter + search + question list + inline Add), shared by "Or browse by
  // skill" (this grade's plan) and "Find any skill" (every grade) below, so both feed the same openSkill/skillQs
  // state and open/expand panel — one implementation, not two.
  const skillRow = (k: { id: string; name: string }, hint?: string) => {
    const open = openSkill === k.id;
    const list = skillQs.id === k.id ? skillQs.list : null;
    const shown = list ? filterQuestions(list, skillLv, skillSearch) : [];
    return (
      <div key={k.id} className="rounded-xl ring-1 ring-slate-200">
        <div className="flex items-center gap-1 ps-1">
          <button type="button" onClick={() => { const next = open ? "" : k.id; setOpenSkill(next); setSkillLv("ALL"); setSkillSearch(""); if (next && skillQs.id !== k.id) { setSkillQs({ id: k.id, list: null }); loadSkillQuestions(k.id).then((l) => setSkillQs((p) => (p.id === k.id ? { id: k.id, list: l } : p))); } }}
            aria-expanded={open} className="flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl px-2 text-start font-semibold text-brand-navy hover:bg-slate-50">
            <span dir="ltr" data-content>{k.name}{hint && <span className="ms-2 text-xs font-normal text-slate-500">{hint}</span>}</span>
            <span aria-hidden="true" className="text-slate-500">{open ? "▲" : "▼"}</span>
          </button>
          <button type="button" className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50" disabled={busy}
            onClick={() => { setBulkDialog({ id: k.id, name: k.name }); setBulkCount("5"); setBulkLv("ALL"); }}>
            ➕ {t("Add a skill")}
          </button>
        </div>
        {open && (
          <div className="space-y-2 border-t border-slate-100 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={t("Level")} className="flex flex-wrap gap-1.5">
                {LEVEL_FILTERS.map((lv) => <button key={lv} type="button" aria-pressed={skillLv === lv} onClick={() => setSkillLv(lv)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ring-1 ${skillLv === lv ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy ring-slate-300"}`}>{t(PICKER_LV[lv])}</button>)}
              </div>
              <input type="search" value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder={t("Search the questions…")} className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-xs" />
            </div>
            {!list ? <p className="px-1 py-2 text-sm text-slate-500" aria-busy="true">{t("Loading questions…")}</p>
              : !list.length ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">{t("This skill has no questions yet.")}</p>
              : !shown.length ? <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-600">{t("No question matches.")}</p>
              : (
                <ul className="max-h-80 space-y-2 overflow-y-auto">
                  {shown.map((qq) => (
                    <li key={qq.id} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 text-sm text-slate-900" dir="ltr" data-content><RichInline text={qq.stem} /></span>
                        <button type="button" className={`${btn} shrink-0`} disabled={busy || ids.includes(qq.id)} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "addBank", questionId: qq.id }, rev), t("Added ✓")); })}>{ids.includes(qq.id) ? "✓" : t("Add")}</button>
                      </div>
                      {qq.choices?.length ? (
                        <ol className="mt-1 grid gap-0.5 text-xs" dir="ltr">
                          {qq.choices.map((c, i) => { const right = isCorrectChoice(c, qq.answer); return <li key={i} className={right ? "font-semibold text-emerald-800" : "text-slate-600"}>{String.fromCharCode(65 + i)}. {c}{right && <span className="ms-1" aria-label={t("Correct answer")}>✓</span>}</li>; })}
                        </ol>
                      ) : qq.answer ? <p className="mt-1 text-xs text-emerald-800"><span className="font-semibold">{t("Answer")}:</span> <span dir="ltr">{qq.answer}</span></p> : null}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          {t("Chosen: {n}", { n: v.chosen })} · <b>{t("Total questions selected (all sections): {n}", { n: v.count })}</b>
        </p>
        {v.chosen > 0 && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); go(async () => { apply(await customReviewChangeAction(grade, { op: "count", count: Number(count) }, rev), t("Saved ✓")); }); }}>
            <label className="text-sm font-semibold text-slate-700">{t("Number of questions")}
              <input type="number" min={1} max={Math.max(1, v.chosen)} value={count} onChange={(e) => setCount(e.target.value)} className={`${field} w-24`} />
            </label>
            <button className={btn} disabled={busy}>{t("Save")}</button>
          </form>
        )}
        <label className="text-sm font-semibold text-slate-700 print:hidden">{t("Level")}
          <select value={level} onChange={(e) => setLevel(e.target.value as LevelFilter)} className={`${field} w-40`}>
            <option value="ANY">{t("All levels")}</option>
            {(Object.keys(LV) as Level[]).map((k) => <option key={k} value={k}>{t(LV[k])}</option>)}
          </select>
        </label>
        {/* 🐛 fix (Oct 2026, "لازم امشي واحد واحد واضغط save"): type into as many sections' "Take" boxes as you
            like, then press this ONE button — it submits every section's current number at once (see
            saveSectionCounts above), not just the row you happen to click. Always shown (fix: "save all مش
            موجود") — pale/disabled until you've actually typed something, rather than appearing and disappearing. */}
        <button type="button" className={main} disabled={busy || Object.keys(sectionInputs).length === 0} onClick={() => saveSectionCounts()}>💾 {t("Save all changes")}</button>
        {/* 📄 fix (Oct 2026, "preview... ملف PDF"): this grade-wide Review had no Preview/Print link at all, unlike
            the per-Set Review page. The question list below already shows full, untruncated text, so printing it
            (or "Save as PDF" from the browser's print dialog) IS the full, clear review the teacher asked for. */}
        <div className="ms-auto flex items-center gap-2 print:hidden">
          <button type="button" className={btn} disabled={busy} aria-pressed={flatView}
            onClick={() => { const next = !flatView; setFlatView(next); if (next) go(() => loadFlatOptions(ids.slice(0, v.count))); }}>
            {flatView ? `📑 ${t("By section")}` : `📋 ${t("All selected questions")}`}
          </button>
          <PrintButton />
          {/* 💾 fix (Oct 2026, "اقدر ارجع لي القديم"): replaces the old "Reset" (which used to delete the Review
              outright) — keeps the current one, under its own saved id, listed forever in "My Reviews" (editable,
              assignable, exactly like now), then clears this grade's live slot to build a fresh one. Hidden while
              viewing an already-archived Review (see the banner above instead, with its own 🗑 Delete). */}
          {!rev && v.chosen > 0 && (
            <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { if (window.confirm(t("Keep this Review exactly as it is (you can reopen it anytime from \"My Reviews\"), and start a brand-new one for Grade {n}?", { n: grade }))) apply(await customReviewChangeAction(grade, { op: "archive" }, rev), t("Saved ✓ — find it anytime in \"My Reviews\".")); })}>
              💾 {t("Save & start new")}
            </button>
          )}
          {rev && (
            <button type="button" className={`${btn} text-red-700 ring-red-200 hover:bg-red-50`} disabled={busy}
              onClick={() => go(async () => { if (window.confirm(t("Delete this saved Review for good? This cannot be undone."))) { const r = await customDeleteArchiveAction(grade, rev); if (r.ok) router.push("/teacher/my-reviews"); else setMsg({ ok: false, text: r.message }); } })}>
              🗑 {t("Delete forever")}
            </button>
          )}
        </div>
      </div>
      {rev && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          📦 {t("This is a saved Review, kept separate from your current Grade {n} Review Builder — changes here only affect this saved copy.", { n: grade })}{" "}
          <Link href={`/teacher/review-builder?grade=${grade}`} className="font-semibold underline">{t("Open the current one →")}</Link>
        </p>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}

      {level !== "ANY" && v.sections.length > 0 && visibleSections.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("No sections of this level yet.")}</p>
      )}
      {!flatView && (
      <ol className="space-y-2" aria-label={t("Sections of the Review")}>
        {visibleSections.map((sec) => {
          const label = sec.label || t("Other");
          const open = openSection === sec.label;
          const peeking = peekSection === sec.label;
          const list = questionsOf(sec.label);
          return (
            <li key={sec.label || "·"} className="rounded-xl bg-white ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-expanded={open}
                  onClick={() => setOpenSection(open ? "" : sec.label)}>
                  <span aria-hidden="true" className="text-slate-500">{open ? "▲" : "▼"}</span>
                  <span className="min-w-0 truncate font-semibold text-brand-navy" dir="ltr">{label}</span>
                  <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {t("{take} of {n} questions", { take: sec.take, n: sec.available })}
                  </span>
                </button>
                <button type="button" className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50" disabled={busy}
                  aria-pressed={peeking} aria-label={t("Preview")} onClick={() => setPeekSection(peeking ? "" : sec.label)}>👁 {t("Preview")}</button>
                <label className="flex shrink-0 items-center gap-1 text-xs font-semibold text-slate-700">
                  {t("Take")}
                  <input type="number" min={0} max={sec.available} value={sectionValue(sec.label, sec.take)}
                    onChange={(e) => setSectionInputs((p) => ({ ...p, [sec.label]: e.target.value }))}
                    className="w-16 rounded-lg border border-slate-300 px-1.5 py-1 text-xs" />
                </label>
                {/* 🗑 fix (Oct 2026, "احذف اي نقطه من هنا"): remove this ONE section+level row's questions from the
                    Review in one click — every other row is untouched. */}
                <button type="button" className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50" disabled={busy}
                  onClick={() => go(async () => { if (window.confirm(t('Remove "{section}" from this Review? (Every other section stays as it is.)', { section: label }))) apply(await customReviewChangeAction(grade, { op: "removeSection", label: sec.label }, rev), t("Saved ✓")); })}>
                  🗑 {t("Remove")}
                </button>
              </div>
              {peeking && !open && (
                <div className="space-y-1 border-t border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
                  {list.slice(0, 3).map((x) => <p key={x.id} dir="ltr" className="truncate"><RichInline text={x.stem} /></p>)}
                  {list.length > 3 && <p className="text-slate-500">{t("… and {n} more", { n: list.length - 3 })}</p>}
                </div>
              )}
              {open && (() => {
                // 🔄 fix (Oct 2026, "ضيف خيار ان المعلم يقدر يبدل السؤال"): the SPARE questions of this section —
                // already in this Review's own pool, just beyond the current "Take" cutoff — the pool a swap picks
                // its replacement from (automatic = the first one; manual = the teacher's own pick from this list).
                const spare = list.filter((q) => ids.indexOf(q.id) >= v.count);
                return (
                <ol className="space-y-2 border-t border-slate-100 p-3">
                  {list.map((x) => {
                    const i = ids.indexOf(x.id);
                    const asked = i < v.count;
                    const swapping = swapFor?.label === sec.label && swapFor.id === x.id;
                    return (
                      <li key={x.id} data-testid="review-q" className={`rounded-xl bg-white p-3 ring-1 ${asked ? "ring-slate-200" : "opacity-60 ring-dashed ring-slate-300"}`}>
                        <div className="flex flex-wrap items-start gap-2">
                          <p className="min-w-0 flex-1 text-sm text-slate-900" data-content lang="en"><RichInline text={x.stem} /></p>
                          <span className="flex flex-wrap gap-1 text-xs">
                            {x.own && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">✏️ {t("My copy")}</span>}
                            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">{x.typeLabel}</span>
                            {!asked && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-200">{t("Not asked")}</span>}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
                          <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customDetailAction(grade, x.id, rev); if (r.ok) setEdit(r.value); else setMsg({ ok: false, text: r.message }); })}>✏️ {t("Edit")}</button>
                          <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "remove", questionId: x.id }, rev)); })}>➖ {t("Remove")}</button>
                          {asked && (
                            <button type="button" className={btn} disabled={busy || !spare.length} aria-expanded={swapping}
                              onClick={() => setSwapFor(swapping ? null : { label: sec.label, id: x.id })}>🔄 {t("Swap")}</button>
                          )}
                        </div>
                        {swapping && (
                          <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-2.5">
                            <button type="button" className={`${main} w-full justify-center`} disabled={busy}
                              onClick={() => go(async () => { if (apply(await customReviewChangeAction(grade, { op: "swapQuestion", label: sec.label, outId: x.id }, rev), t("Saved ✓"))) setSwapFor(null); })}>
                              ⚡ {t("Automatic swap")}
                            </button>
                            <p className="px-1 text-xs font-semibold text-slate-600">{t("Or pick one to swap in:")}</p>
                            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                              {spare.map((sp) => (
                                <li key={sp.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                                  <span className="min-w-0 flex-1 text-xs text-slate-800" dir="ltr" data-content><RichInline text={sp.stem} /></span>
                                  <button type="button" className={`${btn} shrink-0`} disabled={busy}
                                    onClick={() => go(async () => { if (apply(await customReviewChangeAction(grade, { op: "swapQuestion", label: sec.label, outId: x.id, inId: sp.id }, rev), t("Saved ✓"))) setSwapFor(null); })}>
                                    {t("Use this")}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {edit?.id === x.id && (
                          <form className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await customEditAction(grade, { questionId: edit.id, stem: edit.stem, options: edit.options.length ? edit.options : null, answer: edit.answer, answers: edit.answers.length ? edit.answers : null }, rev), t("Saved as your private copy ✓"))) setEdit(null); }); }}>
                            <p className="text-xs text-slate-600">{t("Your change makes a private copy for your classes. The shared question is not changed.")}</p>
                            <label className="block text-sm font-semibold">{t("Question")}<textarea value={edit.stem} onChange={(e) => setEdit({ ...edit, stem: e.target.value })} rows={3} className={field} /></label>
                            {edit.options.map((o, k) => (
                              <label key={o.label} className="flex items-center gap-2 text-sm">
                                <input type={edit.type === "MULTI_SELECT" ? "checkbox" : "radio"} name="correct" checked={o.correct} onChange={() => setEdit({ ...edit, options: edit.options.map((y, j) => ({ ...y, correct: edit.type === "MULTI_SELECT" ? (j === k ? !y.correct : y.correct) : j === k })) })} aria-label={t("Correct answer")} />
                                <b>{o.label}</b><input value={o.text} onChange={(e) => setEdit({ ...edit, options: edit.options.map((y, j) => (j === k ? { ...y, text: e.target.value } : y)) })} className={`${field} mt-0`} />
                              </label>
                            ))}
                            {edit.answer !== null && (
                              <label className="text-sm">{t("Answer")} <select value={edit.answer ? "1" : "0"} onChange={(e) => setEdit({ ...edit, answer: e.target.value === "1" })} className="rounded-lg border border-slate-300 px-2 py-1"><option value="1">{t("True")}</option><option value="0">{t("False")}</option></select></label>
                            )}
                            <div className="flex gap-2"><button className={main} disabled={busy}>{t("Save my copy")}</button><button type="button" className={btn} onClick={() => setEdit(null)}>{t("Cancel")}</button></div>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ol>
                );
              })()}
            </li>
          );
        })}
      </ol>
      )}
      {flatView && (() => {
        let n = 0;
        const groups = visibleSections
          .map((sec) => ({ sec, list: questionsOf(sec.label).filter((x) => ids.indexOf(x.id) < v.count) }))
          .filter((g) => g.list.length > 0);
        return (
          <div className="space-y-4" aria-label={t("All selected questions")} data-testid="review-flat">
            <div className="print:hidden">
              <button type="button" className={btn} aria-pressed={showAnswers} onClick={() => setShowAnswers((p) => !p)}>
                {showAnswers ? `🙈 ${t("Hide answers")}` : `👁 ${t("Show answers")}`}
              </button>
            </div>
            {groups.map(({ sec, list }) => {
              const spare = questionsOf(sec.label).filter((x) => ids.indexOf(x.id) >= v.count);
              return (
                <div key={sec.label || "·"} className="space-y-2 break-inside-avoid">
                  <h3 className="border-b border-slate-200 pb-1 font-semibold text-brand-navy" dir="ltr">{sec.label || t("Other")}</h3>
                  <ol className="space-y-2">
                    {list.map((x) => {
                      n++;
                      const swapping = swapFor?.label === sec.label && swapFor.id === x.id;
                      return (
                        <li key={x.id} data-testid="review-q" className="break-inside-avoid rounded-xl bg-white p-3 ring-1 ring-slate-200">
                          {/* 📖 fix (Oct 2026, "فين الـ passage"): this question's own reading passage (at most
                              one), shown right above it so the printed page is self-contained — repeated above
                              every question of the same passage rather than de-duplicated once per section, since
                              a section is not a guarantee every question in it shares exactly one passage. */}
                          {flatOptions[x.id]?.passageText && (
                            <div className="mb-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                              {flatOptions[x.id]?.passageTitle && <p className="mb-1 text-xs font-bold text-slate-600" dir="ltr">📖 {flatOptions[x.id]?.passageTitle}</p>}
                              <p className="whitespace-pre-line text-xs text-slate-700" dir="ltr">{flatOptions[x.id]?.passageText}</p>
                            </div>
                          )}
                          <div className="flex flex-wrap items-start gap-2">
                            <span className="w-6 shrink-0 text-end text-xs font-bold text-slate-400">{n}.</span>
                            <p className="min-w-0 flex-1 text-sm text-slate-900" data-content lang="en"><RichInline text={x.stem} /></p>
                            <span className="flex flex-wrap gap-1 text-xs">
                              {x.own && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-800 ring-1 ring-violet-200">✏️ {t("My copy")}</span>}
                              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">{x.typeLabel}</span>
                            </span>
                          </div>
                          {/* 📋 fix (Oct 2026, "اظهر السوال كامل بالاختيارات"): the question's own choices (fetched
                              in bulk when this view opens — loadFlatOptions), with the ✓ on the correct one only
                              while "Show answers" is on. Nothing shown here yet (options not loaded or this type
                              has none, e.g. written-response) just falls through silently. */}
                          {(() => {
                            const det = flatOptions[x.id];
                            if (!det) return null;
                            if (det.options.length) {
                              return (
                                <ol className="ms-8 mt-1.5 space-y-0.5">
                                  {det.options.map((o) => (
                                    <li key={o.label} className={`text-sm ${showAnswers && o.correct ? "font-semibold text-teal-700" : "text-slate-700"}`} dir="ltr">
                                      {showAnswers && o.correct ? "✓ " : ""}<b>{o.label}.</b> <RichInline text={o.text} />
                                    </li>
                                  ))}
                                </ol>
                              );
                            }
                            if (det.answer !== null) {
                              return (
                                <ol className="ms-8 mt-1.5 space-y-0.5">
                                  {[true, false].map((b) => (
                                    <li key={String(b)} className={`text-sm ${showAnswers && det.answer === b ? "font-semibold text-teal-700" : "text-slate-700"}`} dir="ltr">
                                      {showAnswers && det.answer === b ? "✓ " : ""}{b ? t("True") : t("False")}
                                    </li>
                                  ))}
                                </ol>
                              );
                            }
                            return null;
                          })()}
                          <div className="mt-2 flex flex-wrap gap-1.5 print:hidden">
                            <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customDetailAction(grade, x.id, rev); if (r.ok) setEdit(r.value); else setMsg({ ok: false, text: r.message }); })}>✏️ {t("Edit")}</button>
                            <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customReviewChangeAction(grade, { op: "remove", questionId: x.id }, rev); apply(r); if (r.ok) await loadFlatOptions(r.value.questions.map((qq) => qq.id).slice(0, r.value.count)); })}>➖ {t("Remove")}</button>
                            <button type="button" className={btn} disabled={busy || !spare.length} aria-expanded={swapping}
                              onClick={() => setSwapFor(swapping ? null : { label: sec.label, id: x.id })}>🔄 {t("Swap")}</button>
                          </div>
                          {swapping && (
                            <div className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-2.5 print:hidden">
                              <button type="button" className={`${main} w-full justify-center`} disabled={busy}
                                onClick={() => go(async () => { const r = await customReviewChangeAction(grade, { op: "swapQuestion", label: sec.label, outId: x.id }, rev); if (apply(r, t("Saved ✓"))) { setSwapFor(null); if (r.ok) await loadFlatOptions(r.value.questions.map((qq) => qq.id).slice(0, r.value.count)); } })}>
                                ⚡ {t("Automatic swap")}
                              </button>
                              <p className="px-1 text-xs font-semibold text-slate-600">{t("Or pick one to swap in:")}</p>
                              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                                {spare.map((sp) => (
                                  <li key={sp.id} className="flex items-start justify-between gap-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
                                    <span className="min-w-0 flex-1 text-xs text-slate-800" dir="ltr" data-content><RichInline text={sp.stem} /></span>
                                    <button type="button" className={`${btn} shrink-0`} disabled={busy}
                                      onClick={() => go(async () => { const r = await customReviewChangeAction(grade, { op: "swapQuestion", label: sec.label, outId: x.id, inId: sp.id }, rev); if (apply(r, t("Saved ✓"))) { setSwapFor(null); if (r.ok) await loadFlatOptions(r.value.questions.map((qq) => qq.id).slice(0, r.value.count)); } })}>
                                      {t("Use this")}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {edit?.id === x.id && (
                            <form className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 print:hidden" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await customEditAction(grade, { questionId: edit.id, stem: edit.stem, options: edit.options.length ? edit.options : null, answer: edit.answer, answers: edit.answers.length ? edit.answers : null }, rev); if (apply(r, t("Saved as your private copy ✓"))) { setEdit(null); if (r.ok) await loadFlatOptions(r.value.questions.map((qq) => qq.id).slice(0, r.value.count)); } }); }}>
                              <p className="text-xs text-slate-600">{t("Your change makes a private copy for your classes. The shared question is not changed.")}</p>
                              <label className="block text-sm font-semibold">{t("Question")}<textarea value={edit.stem} onChange={(e) => setEdit({ ...edit, stem: e.target.value })} rows={3} className={field} /></label>
                              {edit.options.map((o, k) => (
                                <label key={o.label} className="flex items-center gap-2 text-sm">
                                  <input type={edit.type === "MULTI_SELECT" ? "checkbox" : "radio"} name="correct" checked={o.correct} onChange={() => setEdit({ ...edit, options: edit.options.map((y, j) => ({ ...y, correct: edit.type === "MULTI_SELECT" ? (j === k ? !y.correct : y.correct) : j === k })) })} aria-label={t("Correct answer")} />
                                  <b>{o.label}</b><input value={o.text} onChange={(e) => setEdit({ ...edit, options: edit.options.map((y, j) => (j === k ? { ...y, text: e.target.value } : y)) })} className={`${field} mt-0`} />
                                </label>
                              ))}
                              {edit.answer !== null && (
                                <label className="text-sm">{t("Answer")} <select value={edit.answer ? "1" : "0"} onChange={(e) => setEdit({ ...edit, answer: e.target.value === "1" })} className="rounded-lg border border-slate-300 px-2 py-1"><option value="1">{t("True")}</option><option value="0">{t("False")}</option></select></label>
                              )}
                              <div className="flex gap-2"><button className={main} disabled={busy}>{t("Save my copy")}</button><button type="button" className={btn} onClick={() => setEdit(null)}>{t("Cancel")}</button></div>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
            {!groups.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("This Review has no questions yet. Collect some below.")}</p>}
          </div>
        );
      })()}
      {!v.questions.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("This Review has no questions yet. Collect some below.")}</p>}

      {v.hidden.length > 0 && (
        <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200 print:hidden">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">{t("Removed from my Review ({n})", { n: v.hidden.length })}</summary>
          <ul className="mt-2 space-y-1">{v.hidden.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
              <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "restore", questionId: x.id }, rev)); })}>{t("Put back")}</button></li>
          ))}</ul>
        </details>
      )}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden" aria-label={t("Add questions")}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} aria-pressed={tab === "sets"}
            onClick={() => { const next = tab === "sets" ? "" : "sets"; setTab(next); if (next === "sets" && !setsData) go(async () => { const r = await customSetChoicesAction(grade); if (r.ok) setSetsData(r.value); else setMsg({ ok: false, text: r.message }); }); }}>
            🗂️ {t("Text Sets")}
          </button>
          <button type="button" className={btn} aria-pressed={tab === "skills"}
            onClick={() => { const next = tab === "skills" ? "" : "skills"; setTab(next); if (next === "skills" && !skillsData) go(async () => { const r = await customSkillChoicesAction(grade); if (r.ok) setSkillsData(r.value); else setMsg({ ok: false, text: r.message }); }); }}>
            🗣️ {t("Language")}
          </button>
          <button type="button" className={btn} aria-pressed={tab === "write"} onClick={() => setTab(tab === "write" ? "" : "write")}>➕ {t("Write a question")}</button>
          <button type="button" className={btn} aria-pressed={tab === "bank"} onClick={() => setTab(tab === "bank" ? "" : "bank")}>🔎 {t("From the bank")}</button>
          <button type="button" className={btn} disabled={busy} onClick={() => go(async () => { const r = await customDraftAction(grade); if (r.ok) { setW({ ...r.value, options: [...r.value.options] }); setTab("write"); setMsg({ ok: true, text: t("AI draft ready: check and edit it, then add it.") }); } else setMsg({ ok: false, text: r.message }); })}>✨ {t("AI draft")}</button>
        </div>

        {tab === "sets" && (
          <div className="mt-3 space-y-3">
            {!setsData ? (
              <p className="text-sm text-slate-500">{busy ? "…" : t("No Text Set matches.")}</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl p-1">
                {setsData.map((u) => (
                  <div key={u.unit}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Unit {n}", { n: u.unit })} <span dir="ltr">· {u.unitTitle}</span></p>
                    <ul className="mt-1 space-y-1">
                      {u.sets.map((set) => {
                        const key = setKey(set.unit, set.setNumber);
                        const checked = setPicks[key] ?? new Set<Cat>();
                        return (
                          <li key={set.setNumber} className="rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <p className="text-sm font-semibold text-slate-800" dir="ltr">{set.name ?? set.title}</p>
                            {set.name && set.name !== set.title && <p className="text-xs text-slate-500" dir="ltr">{set.title}</p>}
                            <div className="mt-1 flex flex-wrap gap-3">
                              {set.categories.map((cat) => {
                                const pKey = `${set.unit}.${set.setNumber}.${cat}`;
                                return (
                                  <span key={cat} className="flex items-center gap-1">
                                    <label className="flex items-center gap-1.5 text-xs text-slate-700">
                                      <input type="checkbox" checked={checked.has(cat)}
                                        onChange={() => {
                                          if (!checked.has(cat) && addedSetCats.has(pKey)) setMsg({ ok: false, text: t("You already added this — picking it again usually finds nothing new.") });
                                          toggleSetCat(set.unit, set.setNumber, cat);
                                        }} />
                                      {t(CAT_LABEL[cat])}
                                      {addedSetCats.has(pKey) && <span className="rounded-full bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">{t("✓ Added")}</span>}
                                    </label>
                                    <button type="button" className="rounded-full px-1 text-xs text-slate-500 hover:bg-slate-100" disabled={busy}
                                      onClick={() => go(async () => { if (tsPreview?.key === pKey) { setTsPreview(null); return; } setTsPreview({ key: pKey, stems: [] }); const r = await setPreviewAction(grade, set.unit, set.setNumber, cat, level); setTsPreview({ key: pKey, stems: r.ok ? r.value : [] }); })}
                                      aria-pressed={tsPreview?.key === pKey} aria-label={t("Preview")}>👁</button>
                                  </span>
                                );
                              })}
                            </div>
                            {tsPreview && set.categories.some((cat) => `${set.unit}.${set.setNumber}.${cat}` === tsPreview.key) && (
                              <div className="ms-1 mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                                {tsPreview.stems.length ? tsPreview.stems.map((st, i) => <p key={i} dir="ltr" className="truncate"><RichInline text={st} /></p>) : <p>{busy ? "…" : t("No questions to show.")}</p>}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <button type="button" className={main} disabled={busy || !setPicksCount}
              onClick={() => go(async () => {
                const picks = Object.entries(setPicks).map(([key, cats]) => { const [unit, setNumber] = key.split(".").map(Number); return { unit, setNumber, categories: [...cats] }; });
                if (apply(await customReviewChangeAction(grade, { op: "addSets", picks, level }, rev), t("Added ✓"))) {
                  const newlyAdded = picks.flatMap((p) => p.categories.map((cat) => `${p.unit}.${p.setNumber}.${cat}`));
                  setAddedSetCats((s) => new Set([...s, ...newlyAdded]));
                  setSetPicks({});
                }
              })}>
              {t("Add selected ({n})", { n: setPicksCount })}
            </button>
          </div>
        )}

        {tab === "skills" && (
          <div className="mt-3 space-y-3">
            <input type="search" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} placeholder={t("Search skills")} className={field} />
            {!skillsData ? (
              <p className="text-sm text-slate-500">{busy ? "…" : t("No skill matches.")}</p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-xl p-1">
                {skillsData.map((u) => {
                  const matches = u.skills.filter((k) => k.name.toLowerCase().includes(skillQ.trim().toLowerCase()));
                  if (!matches.length) return null;
                  return (
                    <div key={u.number}>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t("Unit {n}", { n: u.number })}</p>
                      <ul className="mt-1 space-y-0.5">
                        {matches.map((k) => (
                          <li key={k.id}>
                            <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                              <label className="flex min-w-0 flex-1 items-center gap-2">
                                <input type="checkbox" checked={skillPicks.has(k.id)}
                                  onChange={() => {
                                    const checking = !skillPicks.has(k.id);
                                    if (checking && addedSkillIds.has(k.id)) setMsg({ ok: false, text: t("You already added this skill's questions — picking it again usually finds nothing new.") });
                                    setSkillPicks((s) => { const n = new Set(s); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; });
                                  }} />
                                <span dir="ltr" className="truncate">{k.name}</span>
                                {addedSkillIds.has(k.id) && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-700">{t("✓ Added")}</span>}
                              </label>
                              <button type="button" className="shrink-0 rounded-full px-1.5 text-xs text-slate-500 hover:bg-slate-100" disabled={busy}
                                onClick={() => go(async () => { if (preview?.id === k.id) { setPreview(null); return; } setPreview({ id: k.id, stems: [] }); const r = await skillPreviewAction(k.id, level); setPreview({ id: k.id, stems: r.ok ? r.value : [] }); })}
                                aria-pressed={preview?.id === k.id} aria-label={t("Preview")}>👁</button>
                            </div>
                            {preview?.id === k.id && (
                              <div className="ms-6 mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                                {preview.stems.length ? preview.stems.map((st, i) => <p key={i} dir="ltr" className="truncate"><RichInline text={st} /></p>) : <p>{busy ? "…" : t("No questions to show.")}</p>}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className={main} disabled={busy || !skillPicks.size}
              onClick={() => go(async () => {
                const picked = [...skillPicks];
                if (apply(await customReviewChangeAction(grade, { op: "addSkills", skillIds: picked, level }, rev), t("Added ✓"))) {
                  setAddedSkillIds((s) => new Set([...s, ...picked]));
                  setSkillPicks(new Set());
                }
              })}>
              {t("Add selected ({n})", { n: skillPicks.size })}
            </button>
          </div>
        )}

        {tab === "write" && (
          <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); go(async () => { if (apply(await customWriteAction(grade, w, rev), t("Added ✓"))) setW(blank()); }); }}>
            <label className="block text-sm font-semibold">{t("Question")}<textarea value={w.stem} onChange={(e) => setW({ ...w, stem: e.target.value })} rows={3} className={field} /></label>
            {w.options.map((o, k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="w-correct" checked={w.correct === k} onChange={() => setW({ ...w, correct: k })} aria-label={t("Correct answer")} />
                <b>{"ABCDEF"[k]}</b><input value={o} onChange={(e) => setW({ ...w, options: w.options.map((y, j) => (j === k ? e.target.value : y)) })} className={`${field} mt-0`} />
              </label>
            ))}
            <p className="text-xs text-slate-500">{t("Tick the correct answer. The question is private to you.")}</p>
            <div className="flex gap-2">
              {w.options.length < 6 && <button type="button" className={btn} onClick={() => setW({ ...w, options: [...w.options, ""] })}>{t("Add a choice")}</button>}
              <button className={main} disabled={busy}>{t("Add to my Review")}</button>
            </div>
          </form>
        )}
        {tab === "bank" && (
          <div className="mt-3 space-y-2">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); runBankSearch({ mine: false, page: 1 }); }}>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Words from the question (3 letters or more)")} className={`${field} mt-0`} />
              <button className={btn} disabled={busy}>{t("Search")}</button>
              <button type="button" className={btn} disabled={busy} onClick={() => runBankSearch({ mine: true, page: 1 })}>{t("My edited copies")}</button>
            </form>
            {bank && (bank.length ? (
              <>
                <ul className="divide-y divide-slate-100">{bank.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span data-content lang="en" className="min-w-0 flex-1"><RichInline text={x.stem} /></span>
                    <button type="button" className={btn} disabled={busy || ids.includes(x.id)} onClick={() => go(async () => { apply(await customReviewChangeAction(grade, { op: "addBank", questionId: x.id }, rev), t("Added ✓")); })}>{ids.includes(x.id) ? "✓" : t("Add")}</button></li>
                ))}</ul>
                {bankPage && bankPage.pages > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2 text-sm text-slate-600">
                    <span>{t("Page {page} of {pages} ({total} questions)", { page: bankPage.page, pages: bankPage.pages, total: bankPage.total })}</span>
                    <div className="flex gap-2">
                      <button type="button" className={btn} disabled={busy || bankPage.page <= 1} onClick={() => runBankSearch({ mine: bankPage.mine, page: bankPage.page - 1 })}>{t("◀ Previous")}</button>
                      <button type="button" className={btn} disabled={busy || bankPage.page >= bankPage.pages} onClick={() => runBankSearch({ mine: bankPage.mine, page: bankPage.page + 1 })}>{t("Next ▶")}</button>
                    </div>
                  </div>
                )}
              </>
            ) : <p className="text-sm text-slate-600">{t("No question matches.")}</p>)}

            {/* 🔎 fix (audit finding, Oct 2026): "Find any skill" searches EVERY grade's skills on the platform —
                not just this Review's own grade — the same search as "Find a skill and assign it" on Teacher Home. */}
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700">{t("Find any skill (all grades)")}</p>
              <form className="mt-2 flex gap-2" onSubmit={runSkillSearch}>
                <input type="search" value={bankSkillQ} onChange={(e) => setBankSkillQ(e.target.value)} dir="ltr" placeholder={t("Type a skill, e.g. main idea")} className={`${field} mt-0`} />
                <button className={btn} disabled={busy}>{t("Search")}</button>
              </form>
              {foundSkills && (foundSkills.length ? (
                <div className="mt-2 max-h-[32rem] space-y-1 overflow-y-auto rounded-xl p-1">
                  {foundSkills.map((f) => skillRow({ id: f.pick.id, name: f.name }, t("Grades {g}", { g: f.grades.join(", ") })))}
                </div>
              ) : <p className="mt-2 text-sm text-slate-600">{t("Nothing matches your search")}</p>)}
            </div>

            {/* 🔎 r91 ("زي اللي موجودة عند واجهة المعلم"): browse by skill — the same level filter + search + full
                question display the teacher already knows from assigning a skill, one skill open at a time. */}
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="text-sm font-semibold text-slate-700">{t("Or browse by skill")}</p>
              {!bankSkillsData ? (
                <button type="button" className={`${btn} mt-2`} disabled={busy} onClick={() => go(async () => { const r = await customSkillChoicesAction(grade); if (r.ok) setBankSkillsData(r.value); else setMsg({ ok: false, text: r.message }); })}>{t("Load the skills")}</button>
              ) : (
                <div className="mt-2 max-h-[32rem] space-y-1 overflow-y-auto rounded-xl p-1">
                  {[...bankSkillsData.flatMap((u) => u.skills)].sort((a, b) => a.name.localeCompare(b.name)).map((k) => skillRow(k))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {bulkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden" role="dialog" aria-modal="true" aria-label={t("Add a whole skill")}
          onClick={(e) => { if (e.target === e.currentTarget) setBulkDialog(null); }}>
          <form className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              go(async () => {
                const n = Math.max(1, Math.round(Number(bulkCount)) || 0);
                if (apply(await customReviewChangeAction(grade, { op: "addSkillCount", skillId: bulkDialog.id, count: n, level: bulkLv === "ALL" ? "ANY" : bulkLv }, rev), t("Added ✓"))) setBulkDialog(null);
              });
            }}>
            <h3 className="font-semibold text-slate-900">{t("Add a whole skill")}</h3>
            <p className="text-sm text-slate-700" dir="ltr">{bulkDialog.name}</p>
            <label className="block text-sm font-semibold text-slate-700">{t("How many questions?")}
              <input type="number" min={1} max={200} value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} className={`${field} w-24`} autoFocus />
            </label>
            <label className="block text-sm font-semibold text-slate-700">{t("Level")}
              <select value={bulkLv} onChange={(e) => setBulkLv(e.target.value as PickerLevelFilter)} className={field}>
                {LEVEL_FILTERS.map((lv) => <option key={lv} value={lv}>{t(PICKER_LV[lv])}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btn} disabled={busy} onClick={() => setBulkDialog(null)}>{t("Cancel")}</button>
              <button className={main} disabled={busy}>{t("Add")}</button>
            </div>
          </form>
        </div>
      )}

      {v.chosen > 0 && roster.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 print:hidden" aria-label={t("Assign")}>
          <h2 className="font-semibold text-slate-900">⭐ {t("Assign")}</h2>
          {assignMsg && <p role={assignMsg.ok ? "status" : "alert"} className={`mt-2 rounded-xl px-4 py-2 text-sm ${assignMsg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{assignMsg.text}</p>}
          <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            go(async () => {
              setAssignMsg(null);
              const r = await customReviewAssignAction({
                grade, classId, source, title, rev,
                adaptive: mode === "ADAPTIVE" ? { maxQuestions: Math.max(v.count, 20), targetCorrect: Math.max(5, Math.min(50, Number(target) || 20)) } : null,
              });
              setAssignMsg(r.ok ? { ok: true, text: t("Assigned ✓ ({n} students)", { n: r.value.students }) } : { ok: false, text: r.message });
            });
          }}>
            <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Class")}
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                {roster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Title")}
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
            </label>
            <fieldset className="flex flex-col text-sm font-semibold text-slate-700">
              <span>{t("How")}</span>
              <div className="mt-1 flex gap-4 font-normal">
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" checked={mode === "FIXED"} onChange={() => setMode("FIXED")} /> {t("Fixed")}</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="mode" checked={mode === "ADAPTIVE"} onChange={() => setMode("ADAPTIVE")} /> {t("Adaptive")}</label>
              </div>
            </fieldset>
            {mode === "ADAPTIVE" && (
              <label className="flex flex-col text-sm font-semibold text-slate-700">{t("Target correct answers")}
                <input type="number" min={5} max={50} value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} w-28`} />
              </label>
            )}
            <SourceSelect t={t} value={source} onChange={setSource} />
            <div className="sm:col-span-2"><button className={main} disabled={busy || !classId}>⭐ {t("Assign")}</button></div>
          </form>
          {/* 🔓 fix (Oct 2026, "خلي fixed مفتوح وغير محدد"): Fixed used to send only the first 60 questions, with
              this note suggesting Adaptive instead. Fixed now sends every chosen question (see review-control.ts /
              assign.ts testCap), so the note no longer applies. */}
        </section>
      )}
    </div>
  );
}
