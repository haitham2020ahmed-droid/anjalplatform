import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { listQuestions, STATUSES, type QuestionStatus } from "@/server/admin/questions";
import { QuestionTable } from "./question-table";
import { editorOptions } from "./editor-data";
import { teacherRoster } from "@/server/teacher/assign";
import { countDeletionRequests } from "@/server/admin/question-requests";
import { SkillAssignHost } from "@/components/skills/skill-assign";
import { assignSkillInline } from "./skill-actions";
import { LEVEL_LABELS } from "@/config/engine";

export const metadata = { title: "Question Bank" };

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };

type SP = { view?: string; status?: string; grade?: string; q?: string; mine?: string; ai?: string; deleted?: string; unit?: string; skill?: string; standard?: string; type?: string; passage?: string; image?: string; page?: string; track?: string; subject?: string; level?: string; source?: string; onmap?: string; use?: string; map?: string };
const SUBJECTS: [string, string][] = [["READING", "Reading"], ["VOCABULARY", "Vocabulary"], ["GRAMMAR", "Grammar"], ["LANGUAGE", "Language"], ["WRITING", "Writing"], ["WORD_STUDY", "Word study / spelling"]];
const SOURCES: [string, string][] = [["TEACHER_AUTHORED", "Written by teachers"], ["SCHOOL_BOOKLET", "School booklet"], ["IMPORTED", "Imported"], ["AI_GENERATED", "AI-generated"], ["DEMO", "Demo"]];
// the platform's own difficulty scale (config/engine LEVEL_LABELS)
const LEVELS: [string, string][] = Object.entries(LEVEL_LABELS).map(([n, l]) => [n, `${n} · ${l}`]);
const PAGE = 100;
const TYPES: [string, string][] = [["MULTIPLE_CHOICE", "Multiple choice"], ["MULTI_SELECT", "Multi select"], ["TRUE_FALSE", "True/false"], ["DROPDOWN", "Dropdown"], ["FILL_BLANK", "Fill in the blank"], ["SHORT_ANSWER", "Short answer"], ["MATCHING", "Matching"], ["SENTENCE_ORDER", "Sentence order"], ["WORD_ORDER", "Word order"], ["ERROR_CORRECTION", "Error correction"]];

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  // teachers land on the published questions (the ones they can assign); admins on the review queue
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as QuestionStatus) : actor.role === "TEACHER" ? "PUBLISHED" : "UNDER_REVIEW";
  const grade = Number(sp.grade) || undefined;
  // picked from the allowed values, so the type is exact (not just string)
  const passage = (["has", "none", "missing"] as const).find((v) => v === sp.passage);
  const image = (["has", "none"] as const).find((v) => v === sp.image);
  const page = Math.max(1, Number(sp.page) || 1);
  const [gradeRows, opts] = await Promise.all([repo.findMany("Grade", { schoolId: actor.schoolId }), editorOptions(repo, actor.schoolId!)]);
  const levels = gradeRows.filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const curricula = await repo.findMany("Curriculum", { gradeId: { in: gradeRows.filter((g) => !grade || Number(g.level) === grade).map((g) => g.id) } });
  const levelOfCur = new Map(curricula.map((c) => [String(c.id), Number(gradeRows.find((g) => g.id === c.gradeId)?.level)]));
  const units = (curricula.length ? await repo.findMany("Unit", { curriculumId: { in: curricula.map((c) => c.id) }, deletedAt: null }, { select: ["id", "number", "title", "curriculumId"] }) : [])
    .map((u) => ({ id: String(u.id), label: `G${levelOfCur.get(String(u.curriculumId))} · Unit ${u.number}: ${u.title}`, g: levelOfCur.get(String(u.curriculumId)) ?? 0, n: Number(u.number) }))
    .sort((x, y) => x.g - y.g || x.n - y.n);
  const skillOptions = opts.skills.filter((k) => !grade || k.grade === grade);
  const filter = { status, grade, q: sp.q?.slice(0, 100) || undefined, mine: sp.mine === "1" || undefined, ai: sp.ai === "1" || undefined, unitId: sp.unit || undefined, skillId: sp.skill || undefined, standard: sp.standard?.slice(0, 60) || undefined, type: sp.type || undefined, passage, image,
    subject: SUBJECTS.some(([v]) => v === sp.subject) ? sp.subject : undefined,
    difficulty: LEVELS.some(([v]) => v === sp.level) ? Number(sp.level) : undefined,
    source: SOURCES.some(([v]) => v === sp.source) ? sp.source : undefined,
    onMap: sp.onmap === "map" || sp.onmap === "bank" ? (sp.onmap as "map" | "bank") : undefined,
    use: sp.use === "PLACEMENT" || sp.use === "MAP_TEST" ? (sp.use as "PLACEMENT" | "MAP_TEST") : undefined,
    mapCode: /^G\d+\.[A-Z0-9.]+$/i.test(sp.map ?? "") ? String(sp.map).toUpperCase() : undefined };
  const roster = actor.role === "TEACHER" ? await teacherRoster(repo, actor) : undefined;
  const pendingDeletions = await countDeletionRequests(repo, actor);
  const grouped = sp.view === "skills" || (sp.view !== "list" && Boolean(filter.q || filter.skillId));
  const PER = grouped ? 400 : PAGE;
  const { items, total, counts, aiPending } = await listQuestions(repo, actor, { status, gradeLevel: grade, q: filter.q, mine: filter.mine, aiOnly: filter.ai, unitId: filter.unitId, skillId: filter.skillId, standardCode: filter.standard, typeCode: filter.type, passage, image, subject: filter.subject, difficulty: filter.difficulty, source: filter.source, onMap: filter.onMap, use: filter.use, mapCode: filter.mapCode, limit: PER, page });
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, view: sp.view, grade: sp.grade, q: sp.q, mine: sp.mine, ai: sp.ai, unit: sp.unit, skill: sp.skill, standard: sp.standard, type: sp.type, passage: sp.passage, image: sp.image, track: sp.track, subject: sp.subject, level: sp.level, source: sp.source, onmap: sp.onmap, use: sp.use, map: sp.map, ...over })) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/admin/questions?${p.toString()}`;
  };
  const tab = (s: QuestionStatus) => qs({ status: s, page: undefined });
  const sel = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={actor.role === "TEACHER" ? "/teacher" : "/admin"} className="text-brand-teal hover:underline">← Back</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy"><span aria-hidden="true">📚</span> Question Bank</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Every question on the platform, in one library. It is separate from the Curriculum Map: search, preview, select ⭐ and use questions for assignments, practice, MAP and placement tests.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/questions?status=DRAFT&ai=1" className="rounded-xl bg-amber-100 px-4 py-2.5 font-semibold text-amber-900">AI drafts to review ({aiPending})</Link>
          <Link href="/admin/question-bank" className="rounded-xl px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">Coverage</Link>
          <Link href="/admin/questions/import" className="rounded-xl px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">Import questions</Link>
          {pendingDeletions > 0 && <Link href="/admin/questions/requests" className="rounded-xl bg-red-50 px-4 py-2.5 font-semibold text-red-800 ring-1 ring-red-200">🗑 Deletion requests ({pendingDeletions})</Link>}
          <Link href="/admin/questions/new" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">New question</Link>
        </div>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Question status">
        {STATUSES.map((s) => <Link key={s} href={tab(s)} aria-current={s === status ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${s === status ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{STATUS_LABEL[s]} ({counts[s]})</Link>)}
      </nav>
      <form method="get" className="mt-3 flex flex-wrap items-center gap-3" aria-label="Filter questions">
        <input type="hidden" name="status" value={status} />
        <select name="grade" defaultValue={sp.grade ?? ""} aria-label="Grade" className={sel}><option value="">All grades</option>{levels.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
        <select name="unit" defaultValue={sp.unit ?? ""} aria-label="Unit" className={`${sel} max-w-[14rem]`}><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select>
        <select name="skill" defaultValue={sp.skill ?? ""} aria-label="Skill" className={`${sel} max-w-[14rem]`}><option value="">All skills</option>{skillOptions.map((k) => <option key={k.id} value={k.id}>G{k.grade} · {k.name}</option>)}</select>
        <input name="standard" defaultValue={sp.standard ?? ""} list="std-list" placeholder="Standard, e.g. RL.4.1" aria-label="Standard" className={`${sel} w-40`} />
        <datalist id="std-list">{opts.standards.map((c) => <option key={c} value={c.replace(/^CCSS\.ELA-LITERACY\./, "")} />)}</datalist>
        <select name="type" defaultValue={sp.type ?? ""} aria-label="Question type" className={sel}><option value="">All types</option>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="passage" defaultValue={sp.passage ?? ""} aria-label="Passage" className={sel}><option value="">Passage: any</option><option value="has">Has passage</option><option value="none">No passage</option><option value="missing">⚠ Possible missing passage</option></select>
        <select name="image" defaultValue={sp.image ?? ""} aria-label="Image" className={sel}><option value="">Image: any</option><option value="has">Has image</option><option value="none">No image</option></select>
        <select name="subject" defaultValue={sp.subject ?? ""} aria-label="Subject" className={sel}><option value="">All subjects</option>{SUBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="level" defaultValue={sp.level ?? ""} aria-label="Difficulty level" className={sel}><option value="">All difficulty levels</option>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="source" defaultValue={sp.source ?? ""} aria-label="Source" className={sel}><option value="">All sources</option>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="onmap" defaultValue={sp.onmap ?? ""} aria-label="Curriculum Map" className={sel}><option value="">Curriculum Map: any</option><option value="map">🧭 On the Curriculum Map</option><option value="bank">📚 Question Bank only</option></select>
        <select name="use" defaultValue={sp.use ?? ""} aria-label="Use" className={sel}><option value="">Use: any</option><option value="PLACEMENT">Placement</option><option value="MAP_TEST">MAP test</option></select>
        {filter.mapCode && <><input type="hidden" name="map" value={filter.mapCode} /><span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-900 ring-1 ring-emerald-300">🧭 Place: {filter.mapCode} <a href={qs({ map: undefined, page: undefined })} aria-label="Remove the place filter" className="font-bold">✕</a></span></>}
        {sp.track && <input type="hidden" name="track" value={sp.track} />}
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search question text or skill name" aria-label="Search" className={sel} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} />Only mine</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ai" value="1" defaultChecked={sp.ai === "1"} />Only AI-drafted</label>
        <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Filter</button>
        <Link href={`/admin/questions?status=${status}`} className="text-sm text-brand-teal hover:underline">Clear filters</Link>
      </form>
      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">{grouped ? "Grouped by skill: tap ⭐ to assign a whole skill, or ☆ to choose questions." : "Tip: search a skill (e.g. main idea) to see its questions grouped under it."}</p>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold" role="group" aria-label="View">
            <Link href={qs({ view: "skills", page: undefined })} aria-current={grouped ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${grouped ? "bg-white text-brand-navy shadow" : "text-slate-500"}`}>▦ By skill</Link>
            <Link href={qs({ view: "list", page: undefined })} aria-current={!grouped ? "page" : undefined} className={`rounded-lg px-3 py-1.5 ${!grouped ? "bg-white text-brand-navy shadow" : "text-slate-500"}`}>▤ List</Link>
          </div>
        </div>
        {sp.deleted === "1" && <p role="status" className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-teal-900">The question was deleted.</p>}
        <QuestionTable
          rows={items.map((q) => ({ id: q.id, stem: q.stem, mine: q.mine, origin: q.origin, grade: q.grade, skill: q.skill, type: q.type, level: q.level, levelLabel: q.levelLabel, status: q.status, updatedAt: q.updatedAt, hasPassage: q.hasPassage, hasImage: q.hasImage, possibleMissingPassage: q.possibleMissingPassage, mapCode: q.mapCode ?? null, uses: q.uses ?? [] }))}
          total={total}
          canPublish={can(actor, "questions:publish")}
          canDelete={(actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") && can(actor, "questions:publish")}
          roster={roster}
          grouped={grouped}
          canAssignSkill={actor.role === "TEACHER"}
          defaultTrack={sp.track === "map" ? "MAP" : sp.track === "nafs" ? "NAFS" : "CURRICULUM"}
          selectionKey={actor.userId}
          filter={filter}
        />
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            {page > 1 && <Link href={qs({ page: page - 1 })} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">← Previous</Link>}
            <span>Page {page} of {pages} · {total} questions</span>
            {page < pages && <Link href={qs({ page: page + 1 })} className="rounded-lg px-3 py-1 ring-1 ring-slate-300">Next →</Link>}
          </nav>
        )}
      </section>
      {roster && <SkillAssignHost classes={roster} assign={assignSkillInline} />}
    </AppShell>
  );
}
