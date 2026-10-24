/**
 * 📘 Full curriculum map as a PDF (owner r79 §A) — one grade's book, unit by unit, every Text Set with the platform's
 * skills, each skill a link straight into the platform.
 *
 *   cover    "Grade 4 Curriculum Map — Wonders", the school's logo / name, Literise, how to use it (click any skill)
 *   unit     a heading (+ one small QR code of the unit for paper copies) and a 2-column table:
 *              left   "Weeks 1 and 2: <essential question>" (when the book's question is known; else the Text Set
 *                     title), the Text Set title and its reading SELECTIONS (Shared Read · Anchor Text · Paired
 *                     Selection; Grade 6: the StudySync selection)
 *              right  the platform's skills of that Text Set grouped by the platform's categories (Vocabulary ·
 *                     Comprehension · Spelling & word study · Writing · Grammar & punctuation), numbered, the skill name
 *                     a link + its short code in grey
 *   footer   the map's name and "Page X of Y" on every page (Chromium footer)
 * Two copies: students (a skill → practise it) and staff (a skill → its skill page with ⭐ Assign). Links come from the
 * ONE plan-link helper (absolute APP_URL, ids only). Interface words follow the reader's language; the book's content
 * (skill names, selections, questions) stays English, left to right.
 *
 * Light for the 512 MB server: the HTML is plain (no web fonts beyond the report fonts, no images but the logo and
 * the small QR paths), ONE curriculum-map PDF is rendered at a time, and the file is kept a few minutes per school +
 * grade + copy + language (6 at most, swept by the cache sweeper) — the map rarely changes.
 *
 * "Send to students": the teacher shares the map with chosen classes of that grade (their OWN classes; admins: the
 * school's) — a document, not an assignment (it never appears in Student Skills or My Work). Stored as one
 * SchoolSetting row per class (`curriculumMap.pdf:<classId>`); the students find it on their Curriculum page.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { consumeRateLimit } from "../auth/rate-limit";
import { accessibleClasses } from "../teacher/assign";
import { teacherMapGrades } from "./view";
import { sweptMap } from "../cache/idle";
import { loadFonts } from "../../reports/fonts";
import { esc } from "../../reports/html";
import type { Branding, ReportDoc } from "../../reports/model";
import { PLATFORM } from "../../components/print/tokens";
import { appOrigin, isPlanHref, planHref, planQrSvg, PLAN_LINKS_NOTE, type PlanAudience } from "../../lib/plan-links";
import { RateLimitedError, REPORT_RATE, loadBranding, type ReportDeps } from "../reports/service";
import { curriculumLessons, studentCurriculumLessons, lessonDetail, type CurriculumUnit } from "./lesson-details";
import eqData from "../../../data/curriculum-map/essential-questions.json";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const json = <T,>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

export type MapLocale = "en" | "ar";
export type MapCopy = "student" | "staff";

// ------------------------------------------------------------------ data

/** The platform's skill categories, grouped as on the Curriculum Map (order of the printed groups). */
export const MAP_CATEGORY_GROUPS: { key: string; en: string; ar: string; categories: string[] }[] = [
  { key: "vocabulary", en: "Vocabulary", ar: "المفردات", categories: ["VOCABULARY"] },
  { key: "comprehension", en: "Comprehension", ar: "الفهم القرائي", categories: ["COMPREHENSION", "LITERATURE", "INFORMATIONAL"] },
  { key: "word-study", en: "Spelling & word study", ar: "الإملاء ودراسة الكلمة", categories: ["PHONICS_WORD_STUDY", "WORD_STUDY"] },
  { key: "writing", en: "Writing", ar: "الكتابة", categories: ["WRITING"] },
  { key: "grammar", en: "Grammar & punctuation", ar: "القواعد وعلامات الترقيم", categories: ["GRAMMAR", "MECHANICS"] },
];
const groupOfCategory = (c: string) => MAP_CATEGORY_GROUPS.find((g) => g.categories.includes(c)) ?? MAP_CATEGORY_GROUPS[1];

export interface MapPdfSkill { id: string; name: string; code: string; group: string }
/** r86: one of a selection's Concept Vocabulary / Analyze Craft and Structure / Review sections, exactly as the
 * Lessons tab lists and assigns it (src/server/curriculum-map/lesson-details.ts#LessonSection) — a CurriculumMapNode
 * "place", not a platform Skill: `code` is the place's own code (what ⭐ Assign sends), not a skillId. */
export interface MapPdfLessonSection {
  code: string; title: string; kind: string | null; ready: boolean;
  /** Oct 2026 ("ممكن تضيف اسماء الكلمات وكمان اسم skill لكل درس analyze craft and structure"): the lesson's own
   * Concept Vocabulary word list (CONCEPT_VOCABULARY rows only) and its Analyze Craft and Structure skill name(s)
   * (ANALYZE_CRAFT_AND_STRUCTURE rows only) — the exact same `vocabulary` / `readingSkills` the Lessons tab already
   * carries (lesson-details.ts#LessonCard), just surfaced here too. Undefined when the source has none. */
  words?: string[]; skillLabel?: string;
}
export interface MapPdfSection {
  number: number; weeks: number[]; essentialQuestion: string | null; title: string; genre: string | null; selections: { label: string; name: string }[]; skills: MapPdfSkill[];
  /** r86 (owner: "حول Concept Vocabulary / Analyze Craft and Structure لنفس اللي في Lessons بالظبط، بنفس ربط
   * الأسئلة، مع الإبقاء على الجرامر"): filled in by skill-plan.ts for the LIVE page only (never by this file / the
   * printed PDF) — Grammar and punctuation (and Writing, Spelling & word study) still come from `skills` above,
   * unchanged; Concept Vocabulary and Analyze Craft and Structure no longer do. */
  lessonSections?: MapPdfLessonSection[];
  /** 🔁 fix (Oct 2026, "ممكن تضيف اسماء الدروس في skill plan زي ما هو موجود في lessons"): the SAME curated lesson
   * name the Lessons tab shows (e.g. "A Life in the Woods"), looked up the exact same way `unitCards()` does
   * (lesson-details.ts#lessonDetail, by the Shared Read text, falling back to the raw title) — null when this
   * Text Set has no entry in the curated file (data/curriculum-map/lesson-details.json), in which case callers keep
   * showing `title` as before. */
  name: string | null;
}
export interface MapPdfUnit { number: number; title: string; sections: MapPdfSection[]; /** the unit's writing skills (Wonders: one writing project per unit, not tied to one week) */ writing: MapPdfSkill[] }
export interface MapPdfData { grade: number; book: string; units: MapPdfUnit[] }

const TEXT_LABEL: Record<string, string> = { shared_read: "Shared Read", anchor_text: "Anchor Text", paired_selection: "Paired Selection", selection: "Selection" };

/** The book's essential question of a Text Set (null when the data has none: Grades 5 and 6 today). */
export function essentialQuestion(grade: number, unit: number, firstWeek: number | null | undefined): string | null {
  if (!firstWeek) return null;
  const g = (eqData as { grades: Record<string, Record<string, Record<string, string>>> }).grades[String(grade)];
  return g?.[String(unit)]?.[String(firstWeek)] ?? null;
}

/** The grade's book → units → Text Sets (weeks, essential question, selections) → the platform's skills. Bounded reads. */
export async function curriculumMapPdfData(repo: Repo, schoolId: string, grade: number): Promise<MapPdfData | null> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }, { take: 1 }))[0];
  if (!g) return null;
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id", "bookId", "isActive", "deletedAt"] })).find((c) => c.isActive !== false && !c.deletedAt);
  if (!cur) return null;
  const book = await repo.findUnique("Book", { id: cur.bookId });
  const units = (await repo.findMany("Unit", { curriculumId: cur.id }, { select: ["id", "number", "title", "isActive", "deletedAt"] })).filter((u) => u.isActive !== false && !u.deletedAt).sort((a, b) => Number(a.number) - Number(b.number));
  const lessons = units.length ? (await repo.findMany("Lesson", { unitId: { in: units.map((u) => s(u.id)) } }, { select: ["id", "unitId", "number", "title", "genre", "weeks", "texts", "deletedAt"] })).filter((l) => !l.deletedAt) : [];
  const [links, unitLinks] = await Promise.all([
    lessons.length ? repo.findMany("LessonSkill", { lessonId: { in: lessons.map((l) => s(l.id)) } }, { select: ["lessonId", "skillId"] }) : Promise.resolve([] as Row[]),
    units.length ? repo.findMany("UnitSkill", { unitId: { in: units.map((u) => s(u.id)) } }, { select: ["unitId", "skillId", "order"] }) : Promise.resolve([] as Row[]),
  ]);
  const skillRows = links.length + unitLinks.length ? await repo.findMany("Skill", { id: { in: [...new Set([...links, ...unitLinks].map((x) => s(x.skillId)))] } }, { select: ["id", "name", "code", "category", "sequence", "isActive", "deletedAt"] }) : [];
  const skill = new Map(skillRows.filter((k) => k.isActive !== false && !k.deletedAt).map((k) => [s(k.id), k]));
  const byLesson = new Map<string, string[]>();
  for (const x of links) { const l = s(x.lessonId); const list = byLesson.get(l) ?? []; if (!list.includes(s(x.skillId))) list.push(s(x.skillId)); byLesson.set(l, list); }
  const order = (k: Row) => MAP_CATEGORY_GROUPS.indexOf(groupOfCategory(s(k.category)));
  return {
    grade, book: s(book?.title) || "Wonders",
    units: units.map((u) => ({
      number: Number(u.number), title: s(u.title) || `Unit ${u.number}`,
      writing: (() => {
        const inLessons = new Set(lessons.filter((l) => s(l.unitId) === s(u.id)).flatMap((l) => byLesson.get(s(l.id)) ?? []));
        const out: MapPdfSkill[] = [];
        for (const x of unitLinks.filter((y) => s(y.unitId) === s(u.id)).sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))) {
          const k = skill.get(s(x.skillId));
          if (!k || inLessons.has(s(k.id)) || groupOfCategory(s(k.category)).key !== "writing" || out.some((y) => y.id === s(k.id))) continue;
          out.push({ id: s(k.id), name: s(k.name), code: s(k.code), group: "writing" });
        }
        return out;
      })(),
      sections: lessons.filter((l) => s(l.unitId) === s(u.id)).sort((a, b) => Number(a.number) - Number(b.number)).map((l) => {
        const weeks = json<number[]>(l.weeks, []).map(Number).filter((n) => n > 0);
        const texts = json<Record<string, string>>(l.texts, {});
        const ks = (byLesson.get(s(l.id)) ?? []).map((id) => skill.get(id)).filter((k): k is Row => Boolean(k))
          .sort((a, b) => order(a) - order(b) || Number(a.sequence ?? 0) - Number(b.sequence ?? 0) || s(a.name).localeCompare(s(b.name)));
        // 🔁 fix (Oct 2026, "ممكن تضيف اسماء الدروس في skill plan"): same lookup unitCards() (lesson-details.ts) uses
        // for the Lessons tab's name — the Shared Read text first (the usual key in the curated file), the raw
        // title as a fallback.
        const lessonName = lessonDetail(grade, texts.shared_read) ?? lessonDetail(grade, s(l.title));
        return {
          number: Number(l.number), weeks, essentialQuestion: essentialQuestion(grade, Number(u.number), weeks[0]),
          title: s(l.title), genre: l.genre ? s(l.genre) : null, name: lessonName?.name ?? null,
          selections: Object.entries(texts).filter(([, v]) => s(v).trim()).map(([k, v]) => ({ label: TEXT_LABEL[k] ?? k.replace(/_/g, " "), name: s(v).trim() })),
          skills: ks.map((k) => ({ id: s(k.id), name: s(k.name), code: s(k.code), group: groupOfCategory(s(k.category)).key })),
        };
      }),
    })),
  };
}

/** 🔗 fix (Oct 2026, "اسم الوحدة واسم الدرس في Skill plan يتجابوا دايمًا من نفس مصدر Lessons"): the unit title and
 * every selection's display name, read straight from the SAME place (and the SAME call) that already supplies
 * `sections` below — never the platform's own (possibly stale) Unit.title / Lesson.title. `unitTitles` is keyed by
 * unit number; `lessonNames` and `sections` share the `${unitNumber}|${selectionNumber}` key. When a grade's map has
 * no entry for some unit/selection (no Curriculum Map for it at all, or numbering that doesn't line up), callers keep
 * falling back to the platform's own title — this never hides a unit/lesson, only renames it when the Lessons tab
 * agrees it has a better name. */
export interface LessonsTabOverlay { sections: Map<string, MapPdfLessonSection[]>; unitTitles: Map<number, string>; lessonNames: Map<string, string> }
const EMPTY_OVERLAY: LessonsTabOverlay = { sections: new Map(), unitTitles: new Map(), lessonNames: new Map() };

/** Pure: unit titles, selection names, and Concept Vocabulary / Analyze Craft and Structure / Review out of an
 * already-fetched Lessons-tab unit list (either `curriculumLessons`'s, for staff, or `studentCurriculumLessons`'s,
 * for students — both lesson-details.ts). */
function overlayFromUnits(units: CurriculumUnit[]): LessonsTabOverlay {
  const sections = new Map<string, MapPdfLessonSection[]>();
  const unitTitles = new Map<number, string>();
  const lessonNames = new Map<string, string>();
  for (const u of units) {
    const um = /^G\d+\.U(\d+)$/.exec(u.code);
    if (!um) continue;
    const unitNumber = Number(um[1]);
    if (u.title.trim()) unitTitles.set(unitNumber, u.title.trim());
    for (const l of u.lessons) {
      // Text Set (Grades 4–5: "TS{n}") or Selection (Grade 6 / StudySync: "SEL{n}") — both are numbered the same
      // way as the matching Lesson.number, just named differently per book (see seed.ts expectedNodes)
      const tm = /^G\d+\.U\d+\.(?:TS|SEL)(\d+)$/.exec(l.code);
      if (!tm) continue;
      const key = `${unitNumber}|${tm[1]}`;
      if (l.name.trim()) lessonNames.set(key, l.name.trim());
      const secs = l.sections.filter((x) => x.kind === "CONCEPT_VOCABULARY" || x.kind === "ANALYZE_CRAFT_AND_STRUCTURE" || x.kind === "REVIEW")
        .map((x) => ({
          code: x.code, title: x.title, kind: x.kind, ready: x.ready,
          ...(x.kind === "CONCEPT_VOCABULARY" && l.vocabulary.length ? { words: l.vocabulary } : {}),
          ...(x.kind === "ANALYZE_CRAFT_AND_STRUCTURE" && l.readingSkills.length ? { skillLabel: l.readingSkills.join(" / ") } : {}),
        }));
      if (secs.length) sections.set(key, secs);
    }
  }
  return { sections, unitTitles, lessonNames };
}

/**
 * r86 + fix above: unit titles, selection names, and Concept Vocabulary / Analyze Craft and Structure / Review for
 * every selection — the exact data (code, title, ready) the Lessons tab itself lists and assigns
 * (src/components/curriculum-map/lesson-card.tsx) — keyed `${unitNumber}|${selectionNumber}` (unit titles by unit
 * number alone). Shared by the live Skill plan page (skill-plan.ts) and this file's own PDF export below, so both
 * read the Curriculum Map's own names the same way. Staff only (curriculumLessons forbids STUDENT/PARENT) — the PDF
 * export below uses `studentCurriculumLessons` instead for a student's own copy. Empty when this grade has no map.
 */
export async function lessonSectionsByLesson(repo: Repo, actor: Actor, grade: number): Promise<LessonsTabOverlay> {
  const { units, grade: level } = await curriculumLessons(repo, actor, grade);
  return level === grade ? overlayFromUnits(units) : EMPTY_OVERLAY; // not this grade's own map (e.g. the actor has no map for it at all)
}

/** Merges `lessonSectionsByLesson`'s output into a MapPdfData — unit title, each selection's display name, and
 * `lessonSections` — the one place both skill-plan.ts and this file's own PDF export apply it, so the merge itself
 * never drifts between the two. A unit/selection with no entry in the overlay keeps its platform-side title/name
 * exactly as before. */
export function withLessonSections(d: MapPdfData, overlay: LessonsTabOverlay): MapPdfData {
  const { sections, unitTitles, lessonNames } = overlay;
  if (!sections.size && !unitTitles.size && !lessonNames.size) return d;
  return {
    ...d,
    units: d.units.map((u) => ({
      ...u,
      title: unitTitles.get(u.number) ?? u.title,
      sections: u.sections.map((sec) => {
        const key = `${u.number}|${sec.number}`;
        const ls = sections.get(key);
        const name = lessonNames.get(key) ?? sec.name;
        return { ...sec, ...(ls?.length ? { lessonSections: ls } : {}), name };
      }),
    })),
  };
}

// ------------------------------------------------------------------ HTML

const WORDS = {
  en: { title: "Grade {g} Curriculum Map — {book}", sub: "The platform's skills for every week of the book", textbook: "Textbook section", skills: "Platform skills", unit: "Unit {n}", unitWriting: "Unit writing", unitWritingNote: "the writing project of the whole unit", weeks: "Weeks {a} and {b}", week: "Week {a}", selection: "Selection {n}", how: "How to use this map", howStudent: ["Find the week your class is reading.", "Click any skill to practise it on Literise.", "Not signed in? Sign in and the skill opens straight after."], howStaff: ["Find the week your class is reading.", "Click any skill to open it on Literise: its questions, ⭐ Assign and a worksheet.", "Not signed in? Sign in and the skill opens straight after."], paper: "On paper: scan the QR code beside a unit to open it.", none: "No platform skills linked yet.", copyStudent: "Students' copy", copyStaff: "Teachers' copy", footer: "Grade {g} Curriculum Map — {book} · Literise" },
  ar: { title: "خريطة منهج الصف {g} — {book}", sub: "مهارات المنصة لكل أسبوع من الكتاب", textbook: "جزء الكتاب", skills: "مهارات المنصة", unit: "الوحدة {n}", unitWriting: "كتابة الوحدة", unitWritingNote: "مشروع الكتابة للوحدة كلها", weeks: "الأسبوعان {a} و{b}", week: "الأسبوع {a}", selection: "النص {n}", how: "طريقة الاستخدام", howStudent: ["ابحث عن الأسبوع الذي يقرؤه صفك.", "انقر أي مهارة لتتدرب عليها في Literise.", "إن لم تكن مسجّل الدخول: سجّل الدخول وستفتح المهارة مباشرة."], howStaff: ["ابحث عن الأسبوع الذي يقرؤه صفك.", "انقر أي مهارة لفتحها في Literise: أسئلتها، ⭐ إسناد، وورقة عمل.", "إن لم تكن مسجّل الدخول: سجّل الدخول وستفتح المهارة مباشرة."], paper: "على الورق: امسح رمز QR بجانب الوحدة لفتحها.", none: "لا توجد مهارات مرتبطة بعد.", copyStudent: "نسخة الطلاب", copyStaff: "نسخة المعلمين", footer: "خريطة منهج الصف {g} — {book} · Literise" },
} as const;
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** "Weeks 1 and 2" / "Week 5" / "Selection 3" (Grade 6: no weeks). */
export function sectionLabel(sec: Pick<MapPdfSection, "weeks" | "number">, locale: MapLocale = "en"): string {
  const w = WORDS[locale];
  const ws = [...sec.weeks].sort((a, b) => a - b);
  if (ws.length >= 2) return fill(w.weeks, { a: ws[0], b: ws[ws.length - 1] });
  if (ws.length === 1) return fill(w.week, { a: ws[0] });
  return fill(w.selection, { n: sec.number });
}

export function mapTitle(d: Pick<MapPdfData, "grade" | "book">, locale: MapLocale = "en"): string {
  return fill(WORDS[locale].title, { g: d.grade, book: d.book });
}

export interface MapHtmlOptions { copy: MapCopy; locale: MapLocale; branding: Branding; fontCss?: string; fontStack?: string; origin?: string; generatedAt?: Date }

/** The full map as one self-contained HTML page (no scripts, no requests: rendered by the shared Chromium engine). */
export function curriculumMapHtml(d: MapPdfData, o: MapHtmlOptions): string {
  const L = o.locale, w = WORDS[L], origin = o.origin ?? appOrigin();
  const aud: PlanAudience = o.copy === "staff" ? "staff" : "student";
  const dir = L === "ar" ? "rtl" : "ltr";
  // Oct 2026 ("غيّر ألوان الـPDF اللي بتروح للطلاب، زي مثال اتفقنا عليه"): a single blue family (navy → bright
  // blue) for the whole document, in place of the navy+teal mix — same structure/markup everywhere below,
  // only these three values changed. Local to this one PDF; the shared BRAND/SOURCE_COLORS tokens (used by
  // every other report) are untouched.
  const navy = "#13295c", teal = "#4f82f7", blue = "#2a5fe0";
  const b = o.branding;
  const logo = b.logo ? `<img class="logo" alt="" src="data:${b.logo.mime};base64,${Buffer.from(b.logo.bytes).toString("base64")}">` : `<div class="logo-text" aria-hidden="true">${esc((b.name.match(/\b\p{L}/gu) ?? []).slice(0, 2).join(""))}</div>`;
  const school = L === "ar" && b.nameAr ? b.nameAr : b.name;
  const how = (o.copy === "staff" ? w.howStaff : w.howStudent).map((x) => `<li>${esc(x)}</li>`).join("");
  const title = mapTitle(d, L);
  const totalSkills = d.units.reduce((n, u) => n + u.sections.reduce((m, sec) => m + sec.skills.length + (sec.lessonSections ?? []).filter((x) => aud !== "student" || x.ready).length, 0) + u.writing.length, 0);
  const stats = `<div class="stats"><div class="stat"><b>${d.units.length}</b><span>${esc(L === "ar" ? "وحدات" : "Units")}</span></div><div class="stat"><b>${totalSkills}</b><span>${esc(L === "ar" ? "مهارة" : "Skills")}</span></div></div>`;
  const toc = `<div class="toc">${d.units.map((u) => `<div class="toc-i"><span class="toc-n">${u.number}</span><span class="toc-t" dir="ltr">${esc(u.title)}</span></div>`).join("")}</div>`;
  const cover = `<section class="cover">
  <div class="cover-glow"></div>
  <div class="cover-top"><div class="brand" dir="ltr">${PLATFORM.slice(0, 3)}<i>${PLATFORM.slice(3)}</i></div>${logo}</div>
  <div class="cover-mid"><p class="school">${esc(school)}</p><h1>${esc(title)}</h1><p class="sub">${esc(w.sub)}</p><p class="copy">${esc(o.copy === "staff" ? w.copyStaff : w.copyStudent)}</p>${stats}${toc}</div>
  <div class="howto"><p class="plinks">${esc(PLAN_LINKS_NOTE[L])}</p><h2>${esc(w.how)}</h2><ol>${how}</ol><p class="paper">${esc(w.paper)}</p></div>
</section>`;
  const skillLi = (k: MapPdfSkill, n: number) => {
    const href = planHref({ kind: "skill", id: k.id }, aud, origin);
    const name = `<bdi dir="ltr">${esc(k.name)}</bdi>`;
    return `<li><span class="n">${n}.</span> ${href && isPlanHref(href, origin) ? `<a class="plink" href="${esc(href)}">${name}</a>` : name} <span class="code" dir="ltr">${esc(k.code)}</span></li>`;
  };
  // r86 (owner: "عدل نسخه pdf... بالظبط زي اللي موجود، منظمة وشكلها أنيق عشان هتروح لأولياء الأمور والطلاب"):
  // Concept Vocabulary / Analyze Craft and Structure / Review print from the Curriculum Map's own categories now
  // (sec.lessonSections, the same ones the Lessons tab lists — see withLessonSections above), not the platform's
  // own Skill rows — each in its own named group, same icon/colour family as the matching live category
  // (Vocabulary=🔤 purple, "craft and structure" reads as Comprehension=📖 blue, Review gets its own 🔁 sky icon).
  // There is no per-student "click to practise" page for these (they're place-based, handed out only once a
  // teacher ⭐ Assigns them), so each prints its title only, no link. A STAFF copy also shows a small Ready / Not
  // ready pill (useful when planning what still needs questions); the STUDENT/family copy skips anything not ready
  // yet outright — a parent has no use for "Not ready", and a document with it looks unfinished.
  // Grammar and punctuation (and Writing, Spelling & word study) are untouched: they keep printing from `sec.skills`.
  const readyWord = L === "ar" ? "جاهز" : "Ready";
  const notReadyWord = L === "ar" ? "غير جاهز" : "Not ready";
  const CAT_OF: Record<string, string> = { CONCEPT_VOCABULARY: "vocabulary", ANALYZE_CRAFT_AND_STRUCTURE: "comprehension", REVIEW: "review" };
  // r87 (owner: "عايز لما اضغط علي concept vocabulary في الـ PDF يوديني عليها"): these three (Concept Vocabulary /
  // Analyze Craft and Structure / Review) used to print title-only — no per-student practice page existed for a
  // "place" rather than a platform Skill. Now one does (/skill?code=…, role-agnostic: staff → the staff preview with
  // the answer key, student/parent → the read-only family preview, signed out → /login first) — so the title links
  // too, exactly like every platform skill already does in this PDF.
  const lessonHref = (code: string) => `${origin}/skill?code=${encodeURIComponent(code)}`;
  const right = (sec: MapPdfSection) => {
    const lessonSections = (sec.lessonSections ?? []).filter((x) => aud !== "student" || x.ready);
    if (!sec.skills.length && !lessonSections.length) return `<p class="muted">${esc(w.none)}</p>`;
    let n = 0;
    const lessonGroups = lessonSections.map((x) => {
      const href = lessonHref(x.code);
      const titleHtml = isPlanHref(href, origin) ? `<a class="plink" href="${esc(href)}">${esc(x.title)}</a>` : esc(x.title);
      return `<div class="grp" data-cat="${CAT_OF[x.kind ?? ""] ?? "vocabulary"}"><h4>${titleHtml}</h4><ol><li><span class="n">${++n}.</span> ${aud !== "student" ? `<span class="status ${x.ready ? "ok" : "wait"}">${esc(x.ready ? readyWord : notReadyWord)}</span>` : ""}</li></ol></div>`;
    }).join("");
    // 🐛 r91 fix: used to unconditionally drop "vocabulary"/"comprehension" from sec.skills, assuming
    // lessonSections always supplies them. If the unit/lesson numbering used to key lessonSectionsByLesson
    // doesn't line up with this section's actual data (e.g. after editing units/lessons), lessonSections comes
    // back without that category and those skills vanished from the PDF/live page with no "none" message —
    // silent content loss. Only skip a category here when lessonSections actually covered it; otherwise fall
    // back to printing it from sec.skills like every other category already does.
    const coveredCats = new Set(lessonSections.map((x) => CAT_OF[x.kind ?? ""] ?? "vocabulary"));
    const skillGroups = MAP_CATEGORY_GROUPS.filter((g) => !coveredCats.has(g.key)).map((g) => {
      const ks = sec.skills.filter((k) => k.group === g.key);
      if (!ks.length) return "";
      return `<div class="grp" data-cat="${g.key}"><h4>${esc(L === "ar" ? g.ar : g.en)}</h4><ol>${ks.map((k) => skillLi(k, ++n)).join("")}</ol></div>`;
    }).join("");
    return lessonGroups + skillGroups;
  };
  const left = (sec: MapPdfSection) => {
    // 🔁 fix (Oct 2026): the curated lesson name (same as the Lessons tab), when the file has one, in place of the
    // generic Text Set title everywhere `sec.title` used to print.
    const dispTitle = sec.name ?? sec.title;
    // Grade 6 (StudySync): the selection IS the lesson — its name once, not twice
    const sels = sec.essentialQuestion ? sec.selections : sec.selections.filter((x) => x.name !== dispTitle);
    return `<span class="wk-pill">${esc(sectionLabel(sec, L))}</span><p class="wk-q"><bdi dir="ltr">${esc(sec.essentialQuestion ?? dispTitle)}</bdi></p>${sec.essentialQuestion ? `<p class="ts" dir="ltr">${esc(dispTitle)}</p>` : sec.genre && !dispTitle.includes(sec.genre) ? `<p class="ts" dir="ltr">${esc(sec.genre)}</p>` : ""}${sels.length ? `<ul class="sel" dir="ltr">${sels.map((x) => `<li><span class="sl">${esc(x.label)}:</span> <i>${esc(x.name)}</i></li>`).join("")}</ul>` : ""}`;
  };
  // r87 (owner: "عدل شكلهم... زي ما اتفقنا قبل"): the Curriculum Map and the Skill Plan print the SAME PDF (this
  // file) — a plain bordered <table> of weeks vs. skills — so one visual pass covers both. Each Text Set is now its
  // own rounded, shadowed card (header pill for "Week(s) N", two soft panels side by side) instead of a table row,
  // which is what kept causing the overlap the teacher saw: a table row's two <td>s force everything in the taller
  // one to the same fixed height band as the other, so a long skill list (right) pushed its own text up against a
  // short textbook blurb (left) with no breathing room. Cards size to their own content instead.
  const sectionCard = (sec: MapPdfSection, extra = "") => `<div class="sec-card${extra}"><div class="sec-l">${left(sec)}</div><div class="sec-r">${right(sec)}</div></div>`;
  const units = d.units.map((u) => {
    const uhref = planHref({ kind: "curriculum-unit", grade: d.grade, unit: u.number }, aud, origin);
    const qr = uhref ? planQrSvg(uhref, 50, origin) : "";
    const writingCard = u.writing.length
      ? `<div class="sec-card uw"><div class="sec-l"><span class="wk-pill uw-pill">${esc(w.unitWriting)}</span><p class="wk-q">${esc(w.unitWritingNote)}</p></div><div class="sec-r">${right({ skills: u.writing } as MapPdfSection)}</div></div>`
      : "";
    return `<section class="unit"><div class="unit-h"><span class="unit-badge">${u.number}</span><h2>${esc(fill(w.unit, { n: u.number }))}</h2><span class="unit-title" dir="ltr">${esc(u.title)}</span>${qr && uhref ? `<a class="qr" href="${esc(uhref)}">${qr}</a>` : ""}</div>
<div class="col-heads"><span>${esc(w.textbook)}</span><span>${esc(w.skills)}</span></div>
<div class="sections">${u.sections.map((sec) => sectionCard(sec)).join("")}${writingCard}</div></section>`;
  }).join("");
  const css = `
@page { size: A4; margin: 12mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${o.fontStack ?? "sans-serif"}; font-size: 9.5pt; line-height: 1.45; color: #1e293b; }
bdi { unicode-bidi: isolate; }

/* ---------- cover ---------- */
.cover { position: relative; height: 265mm; display: flex; flex-direction: column; justify-content: space-between; padding: 14mm 12mm; border-radius: 18px; overflow: hidden;
  background: linear-gradient(150deg, ${navy} 0%, ${navy} 50%, ${teal} 100%); color: #fff; break-after: page; }
.cover-glow { position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(circle at 92% 6%, rgba(255,255,255,.16) 0, transparent 42%),
    radial-gradient(circle at 6% 96%, rgba(255,255,255,.14) 0, transparent 38%),
    radial-gradient(circle at 80% 70%, rgba(255,255,255,.08) 0, transparent 46%); }
.cover-top, .cover-mid, .howto { position: relative; z-index: 1; }
.cover-top { display: flex; justify-content: space-between; align-items: center; }
.brand { font-weight: 800; font-size: 20pt; letter-spacing: .02em; }
.brand i { font-style: normal; color: #9fc1ff; }
.logo { width: 70px; height: 70px; object-fit: contain; background: #fff; border-radius: 14px; padding: 6px; box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.logo-text { width: 70px; height: 70px; border-radius: 14px; background: #fff; color: ${navy}; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 22pt; box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.school { margin: 0; font-size: 12pt; color: #cfe0ff; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.cover h1 { margin: 6px 0 4px; font-size: 31pt; line-height: 1.15; text-shadow: 0 2px 10px rgba(0,0,0,.15); }
.sub { margin: 0; font-size: 13pt; color: #dfeaff; }
.copy { display: inline-block; margin-top: 12px; padding: 3px 14px; border-radius: 999px; background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.35); font-weight: 700; font-size: 9.5pt; }
.stats { display: flex; gap: 10px; margin-top: 14px; }
.stat { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25); border-radius: 12px; padding: 6px 16px; text-align: center; min-width: 76px; }
.stat b { display: block; font-size: 17pt; line-height: 1.1; }
.stat span { font-size: 7.6pt; color: #dbe8ff; text-transform: uppercase; letter-spacing: .05em; }
.toc { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 14px; margin-top: 14px; }
.toc-i { display: flex; align-items: center; gap: 6px; font-size: 8.4pt; color: #eaf1ff; }
.toc-n { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: rgba(255,255,255,.22); font-size: 7.4pt; font-weight: 800; flex: none; }
.toc-t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.howto { background: #fff; color: #1e293b; border-radius: 14px; padding: 13px 17px; box-shadow: 0 10px 26px rgba(0,0,0,.18); }
.howto h2 { margin: 2px 0 6px; font-size: 12pt; color: ${navy}; }
.howto ol { margin: 0; padding-inline-start: 20px; counter-reset: how; list-style: none; }
.howto ol li { counter-increment: how; position: relative; margin: 3px 0; padding-inline-start: 4px; }
.howto ol li::before { content: counter(how); position: absolute; inset-inline-start: -20px; top: 0; width: 15px; height: 15px; border-radius: 50%; background: ${teal}; color: #fff; font-size: 7.6pt; font-weight: 800; display: flex; align-items: center; justify-content: center; }
.plinks { margin: 0 0 8px; color: ${blue}; font-weight: 700; }
.paper { margin: 8px 0 0; color: #475569; font-size: 8.6pt; border-top: 1px dashed #cbd5e1; padding-top: 6px; }

/* ---------- unit pages ---------- */
.unit { break-before: page; }
.unit-h { position: relative; display: flex; align-items: baseline; gap: 10px; border-bottom: 3px solid ${blue}; margin-bottom: 9px; padding-bottom: 6px; break-after: avoid; }
.unit-badge { flex: none; width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, ${blue}, ${navy}); color: #fff; font-weight: 800; font-size: 13pt; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,.2); }
.unit-h h2 { margin: 0; font-size: 20pt; color: ${navy}; }
.unit-title { color: #64748b; font-size: 9.5pt; font-style: italic; }
.qr { display: block; line-height: 0; margin-inline-start: auto; }

/* ---------- column headings + Text Set cards (one per week / selection) ---------- */
.col-heads { display: grid; grid-template-columns: 38% 62%; gap: 10px; margin-bottom: 6px; break-after: avoid; }
.col-heads span { background: linear-gradient(135deg, ${navy}, ${blue}); color: #fff; border-radius: 9px; padding: 5px 12px; font-size: 8.4pt; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
.sections { display: flex; flex-direction: column; gap: 8px; }
.sec-card { display: grid; grid-template-columns: 38% 62%; gap: 0; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 9px rgba(15,23,42,.07); border: 1px solid #e7ecf1; background: #fff; break-inside: avoid; }
.sec-card.uw { background: #fdf8ec; border-color: #f3e4bd; }
.sec-l { padding: 10px 13px; background: #f8fafc; border-inline-end: 1px solid #eef2f6; }
.sec-card.uw .sec-l { background: #fbf1da; border-inline-end-color: #f3e4bd; }
.sec-r { padding: 10px 13px; }
.wk-pill { display: inline-block; background: ${blue}; color: #fff; border-radius: 999px; padding: 2px 11px; font-size: 7.6pt; font-weight: 800; letter-spacing: .02em; }
.uw-pill { background: #d97706; }
.wk-q { margin: 6px 0 3px; font-weight: 600; color: #1e293b; }
.ts { margin: 0 0 4px; color: #475569; font-size: 8.8pt; }
ul.sel { margin: 4px 0 0; padding: 0; list-style: none; font-size: 8.8pt; text-align: left; }
ul.sel li { margin: 1px 0; }
.sl { color: #64748b; }
.grp { break-inside: avoid; margin-bottom: 7px; padding: 5px 9px; border-radius: 9px; border-inline-start: 3px solid #e2e8f0; }
.grp[data-cat="vocabulary"] { border-inline-start-color: #8b5cf6; background: rgba(139,92,246,.06); }
.grp[data-cat="comprehension"] { border-inline-start-color: ${blue}; background: rgba(37,99,235,.05); }
.grp[data-cat="word-study"] { border-inline-start-color: #f59e0b; background: rgba(245,158,11,.06); }
.grp[data-cat="writing"] { border-inline-start-color: #ec4899; background: rgba(236,72,153,.05); }
.grp[data-cat="grammar"] { border-inline-start-color: #10b981; background: rgba(16,185,129,.06); }
.grp[data-cat="review"] { border-inline-start-color: #0ea5e9; background: rgba(14,165,233,.06); }
.grp h4 { margin: 0 0 3px; font-size: 9.6pt; color: ${navy}; }
.grp h4 a.plink { color: ${navy}; border-bottom-color: rgba(30,58,95,.35); }
.grp[data-cat="vocabulary"] h4::before { content: "🔤  "; }
.grp[data-cat="comprehension"] h4::before { content: "📖  "; }
.grp[data-cat="word-study"] h4::before { content: "🔎  "; }
.grp[data-cat="writing"] h4::before { content: "✏️  "; }
.grp[data-cat="grammar"] h4::before { content: "🧩  "; }
.grp[data-cat="review"] h4::before { content: "🔁  "; }
.grp ol { margin: 0; padding: 0; list-style: none; }
.grp li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; margin: 2px 0; }
.status { display: inline-block; border-radius: 6px; padding: 1px 7px; font-size: 7pt; font-weight: 700; letter-spacing: .02em; }
.status.ok { background: #d1fae5; color: #065f46; }
.status.wait { background: #f1f5f9; color: #64748b; }
.n { display: inline-block; min-width: 14px; color: #94a3b8; font-weight: 700; flex: none; }
a.plink { color: #1d4ed8; text-decoration: none; font-weight: 600; border-bottom: 1px solid rgba(29,78,216,.35); }
.code { display: inline-block; color: #fff; background: #94a3b8; font-size: 7pt; font-weight: 700; letter-spacing: .02em; border-radius: 6px; padding: 1px 6px; }
.muted { color: #94a3b8; margin: 0; }
`;
  return `<!doctype html><html lang="${L}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${o.fontCss ?? ""}\n${css}</style></head><body>${cover}${units}</body></html>`;
}

// ------------------------------------------------------------------ who may download which copy

/** The grades whose map this actor may download, and which copy. Students: only a map shared with one of their classes. */
export async function assertMapPdfAccess(repo: Repo, actor: Actor, grade: number, copy: MapCopy): Promise<void> {
  if (!actor.schoolId) throw new ForbiddenError("Not found.");
  if (actor.role === "STUDENT") {
    if (copy !== "student") throw new ForbiddenError("Not found.");
    const shared = await sharedMapGradesForStudent(repo, actor);
    if (!shared.includes(grade)) throw new ForbiddenError("Not found.");
    return;
  }
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Not found.");
  assertCan(actor, "curriculum:read");
  const own = await teacherMapGrades(repo, actor);
  if (own && !own.has(grade)) throw new ForbiddenError("Not found.");
}

// ------------------------------------------------------------------ the PDF (kept a few minutes)

const KEEP_MS = 10 * 60_000;
const kept = sweptMap<string, { at: number; bytes: Uint8Array; filename: string }>("curriculum-map-pdf", KEEP_MS, 6);
let chain: Promise<unknown> = Promise.resolve();
/** ONE curriculum-map PDF is rendered at a time (each waits for the one before it). */
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
/** Tests / an admin edit: forget the kept files. */
export function clearCurriculumMapPdfs(): void { kept.clear(); }

const ascii = (v: string) => v.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "map";

/** The document behind the footer (Chromium page footer: the map's name + "Page X of Y"). */
function footerDoc(title: string, footer: string, locale: MapLocale, now: Date): ReportDoc {
  return { kind: "class", locale, title, subtitle: "", branding: { name: "", nameAr: null, logo: null }, meta: [], sections: [], primaryTable: "", fileStem: "", generatedAt: now, generatedBy: "", footer };
}

export async function exportCurriculumMapPdf(deps: ReportDeps, actor: Actor, grade: number, copy: MapCopy, locale: MapLocale): Promise<{ bytes: Uint8Array; contentType: string; filename: string; cached: boolean }> {
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new ValidationError("Choose a grade.");
  await assertMapPdfAccess(deps.repo, actor, grade, copy);
  const schoolId = s(actor.schoolId);
  const key = `${schoolId}|${grade}|${copy}|${locale}`;
  const now = deps.now?.() ?? new Date();
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return { bytes: hit.bytes, contentType: "application/pdf", filename: hit.filename, cached: true };
  const rl = await consumeRateLimit(deps.repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  if (!deps.pdf) throw new Error("PDF rendering is not configured.");
  const pdf = deps.pdf;
  return oneAtATime(async () => {
    const again = kept.get(key); // a teacher who asked at the same moment waits for the first one and gets its file
    if (again && Date.now() - again.at < KEEP_MS) return { bytes: again.bytes, contentType: "application/pdf", filename: again.filename, cached: true };
    const d0 = await curriculumMapPdfData(deps.repo, schoolId, grade);
    if (!d0 || !d0.units.length) throw new ValidationError("This grade has no curriculum yet.");
    // r86: Concept Vocabulary / Analyze Craft and Structure / Review print from the Curriculum Map's own categories
    // too now, same as the live Skill plan page (skillPlanData) — a student's own copy reads them through
    // studentCurriculumLessons (curriculumLessons/curriculumMapView forbid the STUDENT role outright).
    const overlay = await (actor.role === "STUDENT"
      ? studentCurriculumLessons(deps.repo, actor).then((r) => (r.grade === grade ? overlayFromUnits(r.units) : EMPTY_OVERLAY))
      : lessonSectionsByLesson(deps.repo, actor, grade)
    ).catch(() => EMPTY_OVERLAY);
    const d = withLessonSections(d0, overlay);
    const { warning: _w, ...branding } = await loadBranding(deps.repo, schoolId, deps.brandingDir);
    const fonts = loadFonts(deps.fontDir);
    const html = curriculumMapHtml(d, { copy, locale, branding, fontCss: fonts.css, fontStack: fonts.stack, generatedAt: now });
    const title = mapTitle(d, locale);
    const bytes = await pdf.render(html, footerDoc(title, fill(WORDS[locale].footer, { g: grade, book: d.book }), locale, now), fonts.stack);
    const filename = `curriculum-map_grade-${grade}_${ascii(d.book)}_${copy}${locale === "ar" ? "_ar" : ""}.pdf`;
    kept.set(key, { at: Date.now(), bytes, filename });
    await audit(deps.repo, { actorId: actor.userId, action: "report.export", entityType: "CurriculumMap", entityId: `G${grade}`, after: { kind: "curriculum-map", copy, locale, bytes: bytes.length }, at: now }).catch(() => undefined);
    return { bytes, contentType: "application/pdf", filename, cached: false };
  });
}

/** The download address of the map (the page's ⬇ button, the student's Curriculum page). */
export function curriculumMapPdfHref(grade: number, copy: MapCopy, locale: MapLocale): string {
  return `/api/curriculum-map-pdf?${new URLSearchParams({ grade: String(grade), copy, lang: locale, print: "1" })}`; // r84: a print page
}

// ------------------------------------------------------------------ send to students (a document share)

const SHARE_KEY = (classId: string) => `curriculumMap.pdf:${classId}`;
interface ShareValue { grade: number; sentAt: string | null; sentById: string | null }

export interface MapShareClass { id: string; name: string; students: number; sentAt: string | null }

/** The classes this actor may send the grade's map to (teacher: their OWN classes of that grade; admins: the school's) and when each got it. */
export async function mapShareClasses(repo: Repo, actor: Actor, grade: number): Promise<MapShareClass[]> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") return [];
  const classes = await accessibleClasses(repo, actor);
  const gIds = [...new Set(classes.map((c) => s(c.gradeId)).filter(Boolean))];
  const levelOf = new Map((gIds.length ? await repo.findMany("Grade", { id: { in: gIds } }, { select: ["id", "level"] }) : []).map((g) => [s(g.id), Number(g.level)]));
  const mine = classes.filter((c) => levelOf.get(s(c.gradeId)) === grade).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  if (!mine.length) return [];
  const ids = mine.map((c) => s(c.id));
  const [members, rows] = await Promise.all([
    repo.findMany("ClassMembership", { classId: { in: ids }, leftAt: null }, { select: ["classId"] }),
    repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: { in: ids.map(SHARE_KEY) } }, { select: ["key", "value"] }),
  ]);
  const sent = new Map(rows.map((r) => [s(r.key), json<ShareValue | null>(r.value, null)]));
  return mine.map((c) => {
    const v = sent.get(SHARE_KEY(s(c.id)));
    return { id: s(c.id), name: s(c.name), students: members.filter((m) => s(m.classId) === s(c.id)).length, sentAt: v && v.grade === grade && v.sentAt ? v.sentAt : null };
  });
}

/**
 * "Send to students" (on) or "Stop showing" (off) for chosen classes of the grade. Only classes this actor may send
 * to (checked here, on the server): a class that is not theirs or is of another grade is refused, nothing is sent.
 * A document share: no assignment is made. The students get one notification the first time.
 */
export async function shareCurriculumMap(repo: Repo, actor: Actor, grade: number, classIds: string[], on = true, now = new Date()): Promise<{ classes: number; students: number }> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can send the curriculum map.");
  const wanted = [...new Set(classIds.map(String).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)))];
  if (!wanted.length) throw new ValidationError("Choose at least one class.");
  const allowed = new Map((await mapShareClasses(repo, actor, grade)).map((c) => [c.id, c]));
  if (wanted.some((id) => !allowed.has(id))) throw new ForbiddenError("You can send the map only to your own classes of this grade.");
  const d = await curriculumMapPdfData(repo, s(actor.schoolId), grade);
  if (on && (!d || !d.units.length)) throw new ValidationError("This grade has no curriculum yet.");
  let students = 0;
  for (const id of wanted) {
    const value: ShareValue = { grade, sentAt: on ? now.toISOString() : null, sentById: on ? actor.userId : null };
    await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: SHARE_KEY(id) }, { schoolId: actor.schoolId, key: SHARE_KEY(id), value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
    const members = await repo.findMany("ClassMembership", { classId: id, leftAt: null }, { select: ["studentId"] });
    students += members.length;
    if (on && !allowed.get(id)!.sentAt && members.length) {
      const sts = await repo.findMany("Student", { id: { in: members.map((m) => s(m.studentId)) } }, { select: ["userId"] });
      if (sts.length) await repo.createMany("Notification", sts.map((x) => ({ userId: x.userId, type: "NEW_ASSIGNMENT", title: "📘 Your curriculum map is ready", body: "Open Curriculum to download it. Every skill in it opens its practice.", link: "/student/curriculum", readAt: null, createdAt: now })));
    }
  }
  await audit(repo, { actorId: actor.userId, action: on ? "curriculum_map.pdf.send" : "curriculum_map.pdf.unsend", entityType: "CurriculumMap", entityId: `G${grade}`, after: { classes: wanted.length, students }, at: now }).catch(() => undefined);
  return { classes: wanted.length, students };
}

/** The grades whose map was sent to one of the student's classes (newest first). */
export async function sharedMapGradesForStudent(repo: Repo, actor: Actor): Promise<number[]> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) return [];
  const m = await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] });
  if (!m.length) return [];
  const rows = await repo.findMany("SchoolSetting", { schoolId: actor.schoolId, key: { in: m.map((x) => SHARE_KEY(s(x.classId))) } }, { select: ["value"] });
  const vals = rows.map((r) => json<ShareValue | null>(r.value, null)).filter((v): v is ShareValue => Boolean(v?.sentAt && v.grade));
  return [...new Set(vals.sort((a, b) => s(b.sentAt).localeCompare(s(a.sentAt))).map((v) => Number(v.grade)))];
}
