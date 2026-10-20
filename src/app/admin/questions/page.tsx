import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { getT } from "@/i18n/server";
import { STATUSES, type QuestionStatus } from "@/server/admin/questions";
import { MATCH_MAX, SORTS, bankBanners, bankStatusCounts, familiesMatching, familyOptions, listBankPage, moveTargets, type BankListFilter, type SortKey } from "@/server/admin/questions-list";
import { countDeletionRequests } from "@/server/admin/question-requests";
import { teacherRoster } from "@/server/teacher/assign";
import { LEVEL_LABELS } from "@/config/engine";
import { BankTabs } from "./bank-tabs";
import { QuestionList } from "./question-list";
import { Combo } from "@/components/ui/combo";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { lastFixReport } from "@/server/admin/stuck-questions";
import { FixStuck } from "./fix-stuck";

export const metadata = { title: "Questions" };

/** Every filter the list understands. The last five only come from links on other pages (shown as chips). */
type SP = { q?: string; family?: string; type?: string; status?: string; level?: string; sort?: string; page?: string; skill?: string; map?: string; ai?: string; area?: string; grade?: string; deleted?: string; source?: string; offtopic?: string };

const TYPES: [string, string][] = [["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multi select"], ["TRUE_FALSE", "True/false"], ["DROPDOWN", "Dropdown"], ["FILL_BLANK", "Fill in the blank"], ["SHORT_ANSWER", "Short answer"], ["MATCHING", "Matching"], ["SENTENCE_ORDER", "Sentence order"], ["WORD_ORDER", "Word order"], ["ERROR_CORRECTION", "Error correction"], ["TWO_PART", "Two-part (A/B)"], ["GRID", "Table match (grid)"], ["HOT_TEXT", "Hot text"], ["DICTATION", "Dictation"], ["SENTENCE_COMBINE", "Sentence combining"]];
const STATUS_LABEL: Record<QuestionStatus | "ALL", string> = { ALL: "All", PUBLISHED: "Published", DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", ARCHIVED: "Archived" };
const SORT_LABEL: Record<SortKey, string> = { new: "Newest changes first", old: "Oldest first", easy: "Easiest first", hard: "Hardest first" };

/**
 * Questions: one page of 50, filtered and sorted by the database (see src/server/admin/questions-list.ts).
 * One tab row links the useful question pages; banners point to unsorted questions and drafts.
 */
export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ permission: "questions:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const isAdmin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  const status = (["ALL", ...STATUSES] as string[]).includes(sp.status ?? "") ? (sp.status as QuestionStatus | "ALL") : actor.role === "TEACHER" ? "PUBLISHED" : "ALL";
  const filter: BankListFilter = {
    q: sp.q?.trim().slice(0, 100) || undefined, family: sp.family?.slice(0, 200) || undefined, type: TYPES.some(([v]) => v === sp.type) ? sp.type : undefined,
    status, level: Number(sp.level) >= 1 && Number(sp.level) <= 7 ? Number(sp.level) : undefined, sort: (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as SortKey) : "new",
    page: Math.max(1, Number(sp.page) || 1),
    // from links on other pages
    skillId: sp.skill?.slice(0, 191) || undefined, mapCode: /^G\d+\.[A-Z0-9.]+$/i.test(sp.map ?? "") ? String(sp.map).toUpperCase() : undefined, ai: sp.ai === "1" || undefined,
    mapArea: ["LIT", "INFO", "VOCAB", "GRAMMAR", "MECH", "WRITING", "NONE"].includes(sp.area ?? "") ? sp.area : undefined, grade: Number(sp.grade) || undefined,
    // 🏦 the bank (skill + level, no grade) or the Curriculum Map's own questions (grade → unit → lesson)
    source: sp.source === "map" ? "MAP" : sp.source === "all" ? "ALL" : sp.source === "copies" ? "COPIES" : undefined,
    // ⚠️ only questions under a skill with a scope rule whose own text doesn't look like it belongs there
    scopeFlag: sp.offtopic === "1" || undefined,
  };
  const [list, counts, banners, families, matches, targets, deletions, roster, lastFix, gradeRows] = await Promise.all([
    listBankPage(repo, actor, filter), bankStatusCounts(repo, actor, filter), bankBanners(repo, actor), familyOptions(repo, actor),
    filter.q && !filter.family ? familiesMatching(repo, actor, filter.q) : Promise.resolve([]),
    can(actor, "questions:publish") ? moveTargets(repo, actor) : Promise.resolve([]), countDeletionRequests(repo, actor),
    actor.role === "TEACHER" ? teacherRoster(repo, actor) : Promise.resolve(undefined),
    isAdmin && actor.schoolId && can(actor, "questions:publish") ? lastFixReport(repo, actor.schoolId) : Promise.resolve(null),
    actor.schoolId ? repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["level"] }) : Promise.resolve([]),
  ]);
  // 🔎 every grade the school has (not just grades with questions already in them) — so picking Grade 6 here, even
  // with nothing imported yet, correctly shows "0 questions" rather than Grade 6 being impossible to even select
  const grades = [...new Set(gradeRows.map((g) => Number(g.level)))].sort((a, b) => a - b);
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, family: sp.family, type: sp.type, status: sp.status, level: sp.level, sort: sp.sort, skill: sp.skill, map: sp.map, ai: sp.ai, area: sp.area, grade: sp.grade, source: sp.source, offtopic: sp.offtopic, ...over })) if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/admin/questions${s ? `?${s}` : ""}`;
  };
  const chips: { label: string; clear: Record<string, undefined> }[] = [
    ...(filter.skillId ? [{ label: `${t("Skill")}: ${list.rows[0]?.skill || filter.skillId}`, clear: { skill: undefined } }] : []),
    ...(filter.mapCode ? [{ label: `${t("Map place")}: ${filter.mapCode}`, clear: { map: undefined } }] : []),
    ...(filter.ai ? [{ label: t("AI-drafted"), clear: { ai: undefined } }] : []),
    ...(filter.mapArea ? [{ label: `MAP · ${filter.mapArea === "NONE" ? t("not classified yet") : filter.mapArea}`, clear: { area: undefined } }] : []),
    ...(filter.grade ? [{ label: `${t("Grade")} ${filter.grade}`, clear: { grade: undefined } }] : []),
    ...(filter.scopeFlag ? [{ label: `⚠️ ${t("off-topic?")}`, clear: { offtopic: undefined } }] : []),
  ];
  const sel = "min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="book" title="Questions"
        subtitle={t("Search, preview and edit every question. Open a row to see its choices and answer.")}>
        <Link href="/admin/questions/new" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">{t("New question")}</Link>
        {actor.role === "SCHOOL_ADMIN" && <Link href="/admin/questions/load" prefetch={false} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal"><LineIcon name="download" className="h-5 w-5" />{t("Load new questions")}</Link>}
        {isAdmin && (
          <Link href={qs({ offtopic: filter.scopeFlag ? undefined : "1", page: undefined })} prefetch={false} aria-current={filter.scopeFlag ? "page" : undefined}
            title={t("Questions under a skill with a scope rule whose own text doesn't look like it belongs there")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold ring-1 ${filter.scopeFlag ? "bg-red-600 text-white ring-red-600" : "bg-white text-red-700 ring-slate-300 hover:ring-red-400"}`}>
            ⚠️ {t("off-topic?")}
          </Link>
        )}
      </PageHeader>
      {isAdmin && <BankTabs />}
      <div className="space-y-2">
        {/* 🛠 one action for every stuck question: classify, repair, publish (drafts are published here, not elsewhere) */}
        {isAdmin && actor.schoolId && can(actor, "questions:publish") && <FixStuck counts={{ unclassified: banners.unclassified, drafts: banners.drafts, waiting: banners.waiting }} last={lastFix} />}
        {isAdmin && banners.unclassified > 0 && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-200">
            <LineIcon name="layers" className="h-5 w-5 shrink-0" />{t("{n} questions are not under a skill.", { n: banners.unclassified.toLocaleString("en") })}
            <Link href="/admin/questions/unclassified" prefetch={false} className="font-semibold underline">{t("Sort them")}</Link>
          </p>
        )}
        {deletions > 0 && (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-red-900 ring-1 ring-red-200">
            <LineIcon name="inbox" className="h-5 w-5 shrink-0" />{t("{n} requests from teachers (changes or deletions).", { n: deletions })}
            <Link href="/admin/questions/requests" className="font-semibold underline">{t("Decide")}</Link>
          </p>
        )}
        {sp.deleted === "1" && <p role="status" className="rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{t("The question was deleted.")}</p>}
      </div>

      <form method="get" className="mt-4 grid gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))_auto]" aria-label={t("Filter questions")}>
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t("Search the question text")} aria-label={t("Search")} className={sel} />
        <Combo name="family" label={t("Skill")} defaultValue={filter.family ?? ""} options={[{ value: "", label: t("All skills") }, ...families.map((f) => ({ value: f.key, label: f.name }))]} className="min-w-56" dir="ltr" />
        {grades.length > 0 && <select name="grade" defaultValue={sp.grade ?? ""} aria-label={t("Grade")} className={sel}><option value="">{t("All grades")}</option>{grades.map((g) => <option key={g} value={g}>{t("Grade {n}", { n: g })}</option>)}</select>}
        <select name="type" defaultValue={filter.type ?? ""} aria-label={t("Question type")} className={sel}><option value="">{t("All types")}</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="status" defaultValue={status} aria-label={t("Status")} className={sel}>{(["ALL", ...STATUSES] as const).map((st) => <option key={st} value={st}>{t(STATUS_LABEL[st])}</option>)}</select>
        <select name="level" defaultValue={sp.level ?? ""} aria-label={t("Level")} className={sel}><option value="">{t("All levels")}</option>{Object.entries(LEVEL_LABELS).map(([n, l]) => <option key={n} value={n}>{n} · {l}</option>)}</select>
        <select name="sort" defaultValue={filter.sort} aria-label={t("Sort")} className={sel}>{SORTS.map((k) => <option key={k} value={k}>{t(SORT_LABEL[k])}</option>)}</select>
        {sp.skill && <input type="hidden" name="skill" value={sp.skill} />}
        {sp.map && <input type="hidden" name="map" value={sp.map} />}
        {sp.ai && <input type="hidden" name="ai" value={sp.ai} />}
        {sp.area && <input type="hidden" name="area" value={sp.area} />}
        {!grades.length && sp.grade && <input type="hidden" name="grade" value={sp.grade} />}
        {sp.source && <input type="hidden" name="source" value={sp.source} />}
        <div className="flex items-center gap-2">
          <button className="min-h-11 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">{t("Filter")}</button>
          <Link href="/admin/questions" className="text-sm text-brand-teal hover:underline">{t("Clear")}</Link>
        </div>
      </form>

      <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("Question source")}>
        {([["", "Question Bank", "Skill + level (Approaching / Meeting / Exceeding), for every grade", "building"], ["map", "Curriculum Map", "Grade → Unit → Lesson", "compass"],
          ["copies", isAdmin ? "Teacher copies" : "My edited copies", "Questions a teacher edited for a test: private to that teacher, never in the shared bank", "pen"]] as const).map(([v, label, hint, icon]) => {
          const on = (sp.source ?? "") === v;
          return <Link key={v || "bank"} href={qs({ source: v || undefined, page: undefined })} aria-current={on ? "page" : undefined} title={t(hint)} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${on ? "bg-brand-teal text-white" : "bg-white text-brand-navy ring-1 ring-slate-200"}`}><LineIcon name={icon as LineIconName} className="h-4 w-4" />{t(label)}</Link>;
        })}
      </nav>
      <nav className="mt-3 flex flex-wrap gap-2" aria-label={t("Status")}>
        {(["ALL", ...STATUSES] as const).map((st) => (
          <Link key={st} href={qs({ status: st, page: undefined })} aria-current={st === status ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${st === status ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{t(STATUS_LABEL[st])} <span className="tabular-nums">({counts[st].toLocaleString("en")})</span></Link>
        ))}
      </nav>
      {(chips.length > 0 || matches.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => <Link key={c.label} href={qs({ ...c.clear, page: undefined })} className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-900 ring-1 ring-indigo-200" aria-label={`${t("Remove filter")}: ${c.label}`}>{c.label} ✕</Link>)}
          {matches.length > 0 && <span className="text-slate-600">{t("Skills named like your search:")}</span>}
          {matches.map((m) => <Link key={m.key} href={qs({ family: m.key, q: undefined, page: undefined })} className="rounded-full bg-white px-3 py-1 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{m.name}</Link>)}
        </div>
      )}

      <section className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-slate-200 sm:p-4">
        <QuestionList
          rows={list.rows} total={list.total} filter={filter}
          canPublish={can(actor, "questions:publish")} canDelete={isAdmin && can(actor, "questions:publish")}
          targets={targets} roster={roster && roster.length ? roster : undefined}
        />
        <nav aria-label={t("Pages")} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {list.page > 1 && <Link href={qs({ page: list.page - 1 })} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">← {t("Previous")}</Link>}
          <span>{t("Page {n} of {m}", { n: list.page, m: list.pages })} · {t("{n} questions", { n: list.total.toLocaleString("en") })}</span>
          {list.page < list.pages && <Link href={qs({ page: list.page + 1 })} className="rounded-lg px-3 py-1.5 ring-1 ring-slate-300">{t("Next")} →</Link>}
          {list.capped && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t("Showing only the first {n} off-topic matches. Narrow the filters for the rest.", { n: MATCH_MAX.toLocaleString("en") })}</span>}
        </nav>
      </section>
    </AppShell>
  );
}
