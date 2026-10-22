/**
 * 📊 The Reports hub (owner r67: "organise everything, especially REPORTS — nothing exists twice"): every report in
 * FOUR groups — My class (overview, skills, growth) · Students (the one student file) · Programs (MAP, NAFS,
 * ReadRise, Learn, Writing, Fluency) · Follow-up (early warning, alerts, interventions, family reports) — with the
 * page that shows it for a class and / or one student, whether it takes a date range, its Excel / CSV downloads and
 * whether it can be sent to the family. Pure data + pure helpers (no server code):
 *  - the Reports page (/teacher/reports) draws the cards (hubCards) and opens a report straight away (openReportUrl);
 *  - the report bar on top of every report page (src/components/teacher/report-bar.tsx) finds the report from the
 *    address (matchReport) and offers the class switcher, the student picker, the date range, Download and Send.
 *  - HUB_LINKS: a programme's own page (ReadRise, Fluency, NAFS, Learn, Alerts, Interventions) is linked, never copied.
 * Merged in r67 (old addresses redirect): Student Progress + the older Student file → the student file
 * (/teacher/students/[id]); Needs help → Mistakes and root causes; the Progress report for parents → Family Reports;
 * Who Needs Help → Alerts; the Weekly family summary → Family reports this week.
 */
import type { LineIconName } from "../ui/line-icon";

export type ReportScope = "class" | "student";
export type ReportPeriod = "week" | "month" | "term";
export type ReportCategory = "My class" | "Students" | "Programs" | "Follow-up";

export const REPORT_CATEGORIES: { key: ReportCategory; line: LineIconName; hint: string }[] = [
  { key: "My class", line: "school", hint: "Your class: progress, skills and growth." },
  { key: "Students", line: "student", hint: "One student in depth." },
  { key: "Programs", line: "target", hint: "MAP, NAFS, ReadRise, Learn, Writing and Fluency." },
  { key: "Follow-up", line: "alert", hint: "Who needs help now, what was done, and the reports for families." },
];

export const REPORT_PERIODS: { key: ReportPeriod; label: string; days: number; range: string }[] = [
  { key: "week", label: "This week", days: 7, range: "LAST_7_DAYS" },
  { key: "month", label: "This month", days: 30, range: "LAST_30_DAYS" },
  { key: "term", label: "This term", days: 90, range: "TERM" },
];
/** Reports with a date range open on the current term. */
export const DEFAULT_PERIOD: ReportPeriod = "term";

export interface ReportTarget { classId: string; studentId?: string; period: ReportPeriod }
export interface ReportFile { label: string; href: string }
export interface ReportMatch { scope: ReportScope; classId?: string; studentId?: string; period?: ReportPeriod }
export interface ReportDef {
  key: string; category: ReportCategory; title: string; hint: string; line: LineIconName;
  /** the page for the whole class (absent = no class version) */
  classUrl?: (p: ReportTarget) => string;
  /** the page for one student (absent = no student version) */
  studentUrl?: (p: ReportTarget & { studentId: string }) => string;
  /** the report takes a date range (this week / month / term) */
  period?: boolean;
  /** "Send to family" (the school admin approves first) */
  send?: boolean;
  /** Excel / CSV / Word files besides the PDF (print) */
  files?: (p: ReportTarget & { scope: ReportScope }) => ReportFile[];
  /** is this address (path + query) this report? → who it is about */
  match: (path: string, q: URLSearchParams) => ReportMatch | null;
}

const per = (k: ReportPeriod | undefined) => REPORT_PERIODS.find((x) => x.key === k) ?? REPORT_PERIODS[2];
const qs = (o: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
const id = (v: string) => encodeURIComponent(v);
/** /api/reports downloads (the route checks access): a PDF file, Excel and CSV. */
const apiFiles = (kind: string, o: Record<string, string | number | undefined>): ReportFile[] =>
  (["pdf", "xlsx", "csv"] as const).map((format) => ({ label: { pdf: "PDF file", xlsx: "Excel", csv: "CSV" }[format], href: `/api/reports?${qs({ kind, format, lang: "en", period: "TERM", ...o, ...(format === "pdf" ? { print: 1 } : {}) })}` }));

/** The date range an address carries (?days=7|30|90 or ?range=LAST_7_DAYS|LAST_30_DAYS|TERM). */
export function periodOf(q: URLSearchParams): ReportPeriod | undefined {
  const d = Number(q.get("days")), r = q.get("range");
  return REPORT_PERIODS.find((p) => (d && p.days === d) || (r && p.range === r))?.key;
}

/** A matcher: the path pattern (named groups classId / studentId) + an optional query test; the rest from the query. */
function on(re: RegExp, scope: ReportScope | ((q: URLSearchParams) => ReportScope), when?: (q: URLSearchParams) => boolean) {
  return (path: string, q: URLSearchParams): ReportMatch | null => {
    const m = re.exec(path);
    if (!m || (when && !when(q))) return null;
    const g = m.groups ?? {};
    const studentId = g.studentId ? decodeURIComponent(g.studentId) : q.get("studentId") ?? q.get("student") ?? undefined;
    return { scope: typeof scope === "function" ? scope(q) : scope, classId: g.classId ? decodeURIComponent(g.classId) : q.get("classId") ?? q.get("class") ?? undefined, studentId: studentId || undefined, period: periodOf(q) };
  };
}
const either = (...ms: ReturnType<typeof on>[]) => (path: string, q: URLSearchParams) => { for (const m of ms) { const r = m(path, q); if (r) return r; } return null; };
const byStudentParam = (k: string) => (q: URLSearchParams): ReportScope => (q.get(k) ? "student" : "class");

export const REPORTS: ReportDef[] = [
  // ---- My class: overview, skills, growth
  { key: "class-progress", category: "My class", line: "growth", title: "Class progress", hint: "This month against last month: new stars, skills improved, effort. Never against other classes.",
    classUrl: (p) => `/teacher/reports/class?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/reports\/class$/, "class") },
  { key: "class-dashboard", category: "My class", line: "grid", title: "Students dashboard", hint: "Progress, accuracy and status of every student.",
    classUrl: (p) => `/teacher/progress?${qs({ classId: p.classId })}`,
    files: (p) => [{ label: "Excel · Reading", href: `/api/progress-export?${qs({ classId: p.classId, subject: "READING" })}` }, { label: "Excel · Language", href: `/api/progress-export?${qs({ classId: p.classId, subject: "LANGUAGE" })}` }],
    match: on(/^\/teacher\/progress$/, "class") },
  { key: "errors", category: "My class", line: "puzzle", title: "Mistakes and root causes", hint: "Mistakes in plain words, the real gap underneath, and what to re-teach.",
    classUrl: (p) => `/teacher/reports/errors?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/reports\/errors$/, "class") },
  { key: "curriculum-results", category: "My class", line: "compass", title: "Curriculum results", hint: "How the class did on each unit and skill.",
    classUrl: (p) => `/teacher/curriculum-results?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/curriculum-results$/, "class") },
  // 🆕 feature (Oct 2026): a class-level report of sent Reviews (Review Builder / per-Text-Set Review ⭐ Assign),
  // separate from Student Skills (which excludes multi-skill work like a Review by design — see review-reports.ts).
  { key: "review-reports", category: "My class", line: "file", title: "Review Reports", hint: "Every Review you sent to a class: who finished, who is overdue, accuracy, and a per-skill breakdown.",
    classUrl: (p) => `/teacher/reports/review-reports?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/reports\/review-reports$/, "class") },
  { key: "grammar", category: "My class", line: "layers", title: "Grammar results", hint: "Grammar skills: mastery, common errors, what to reteach.", period: true,
    classUrl: (p) => `/teacher/reports/grammar?${qs({ classId: p.classId, days: per(p.period).days })}`,
    studentUrl: (p) => `/teacher/reports/grammar/${id(p.studentId)}?${qs({ days: per(p.period).days })}`,
    files: (p) => (p.scope === "class" ? apiFiles("grammar", { classId: p.classId, days: per(p.period).days }) : []),
    match: either(on(/^\/teacher\/reports\/grammar\/(?<studentId>[^/]+)$/, "student"), on(/^\/teacher\/reports\/grammar$/, "class")) },
  { key: "practice", category: "My class", line: "clock", title: "Practice and time", hint: "Questions and minutes by day, by skill and per student.", period: true,
    classUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p.period).range })}`,
    studentUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p.period).range, student: p.studentId })}`,
    match: on(/^\/teacher\/practice-analytics$/, byStudentParam("student")) },
  // ---- Students: the ONE student file (Student Progress and the older student file redirect to it)
  { key: "student-file", category: "Students", line: "file", title: "Student file", hint: "One student: language profile, mistakes, MAP, ReadRise level, follow-up.",
    studentUrl: (p) => `/teacher/students/${id(p.studentId)}`,
    match: on(/^\/teacher\/students\/(?<studentId>[^/]+)$/, "student") },
  // ---- Programs: MAP, NAFS, ReadRise, Learn, Writing, Fluency (+ ReadMaster and Live Challenge)
  { key: "map-profile", category: "Programs", line: "target", title: "MAP profile", hint: "RIT, percentile bands and the areas to work on.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/profile?subject=READING`,
    studentUrl: (p) => `/map-report/profile/${id(p.studentId)}`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/profile$/, "class"), on(/^\/map-report\/profile\/(?<studentId>[^/]+)$/, "student")) },
  { key: "map-groups", category: "Programs", line: "users", title: "Group study plan", hint: "The class grouped Below / On / Above level: each band's RIT range, growth projection and skills.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/groups?subject=READING`,
    files: (p) => [{ label: "3-level group plan (Word)", href: `/api/personal-plan-doc?${qs({ classId: p.classId, subject: "reading" })}` }],
    match: on(/^\/map-report\/class\/(?<classId>[^/]+)\/groups$/, "class") },
  { key: "map-study-plans", category: "Programs", line: "plans", title: "MAP study plans", hint: "Each student's personal study plan from the MAP scores.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/study-plans?subject=READING`,
    studentUrl: (p) => `/map-report/study-plan/${id(p.studentId)}?subject=READING`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/study-plans$/, "class"), on(/^\/map-report\/study-plan\/(?<studentId>[^/]+)$/, "student")) },
  { key: "map-growth", category: "Programs", line: "growth", title: "MAP Growth Report", hint: "Every student's RIT and who reached the expected growth.",
    classUrl: (p) => `/teacher/map-center?${qs({ tab: "reports", classId: p.classId })}`,
    match: on(/^\/teacher\/map-center$/, "class", (q) => q.get("tab") === "reports" && q.get("view") !== "overview") },
  { key: "map-overview", category: "Programs", line: "chart", title: "Grade and school overview", hint: "Every grade and class side by side: mean RIT vs national, bands, growth.",
    classUrl: (p) => `/teacher/map-center?${qs({ tab: "reports", view: "overview", classId: p.classId })}`,
    match: on(/^\/teacher\/map-center$/, "class", (q) => q.get("tab") === "reports" && q.get("view") === "overview") },
  { key: "writing", category: "Programs", line: "pen", title: "Writing results", hint: "Rubric scores (%) of graded writing, by student and task.",
    classUrl: (p) => `/teacher/writing/report?${qs({ classId: p.classId })}`,
    studentUrl: (p) => `/teacher/writing/report?${qs({ classId: p.classId, studentId: p.studentId })}`,
    match: on(/^\/teacher\/writing\/report$/, byStudentParam("studentId")) },
  { key: "readmaster", category: "Programs", line: "book", title: "ReadMaster", hint: "By student, by text and by skill.", period: true,
    classUrl: (p) => `/teacher/reports/readmaster?${qs({ classId: p.classId, days: per(p.period).days })}`,
    studentUrl: (p) => `/teacher/reports/readmaster/${id(p.studentId)}?${qs({ days: per(p.period).days })}`,
    files: (p) => (p.scope === "class" ? apiFiles("readmaster", { classId: p.classId, days: per(p.period).days }) : []),
    match: either(on(/^\/teacher\/reports\/readmaster\/(?<studentId>[^/]+)$/, "student"), on(/^\/teacher\/reports\/readmaster$/, "class")) },
  { key: "live-games", category: "Programs", line: "game", title: "Live Challenge results", hint: "Participation and accuracy by skill in live games.", period: true,
    classUrl: (p) => `/teacher/reports/games?${qs({ classId: p.classId, days: per(p.period).days })}`,
    files: (p) => apiFiles("games", { classId: p.classId, days: per(p.period).days }),
    match: on(/^\/teacher\/reports\/games$/, "class") },
  { key: "games-usage", category: "Programs", line: "star", title: "Games Report", hint: "The most played and best rated games.", period: true,
    classUrl: (p) => `/teacher/reports/games-usage?${qs({ classId: p.classId, days: per(p.period).days })}`,
    match: on(/^\/teacher\/reports\/games-usage$/, "class") },
  // ---- Follow-up: early warning, alerts, interventions, family reports
  { key: "early-warning", category: "Follow-up", line: "alert", title: "🚨 Early warning", hint: "Drops, rises and up-down swings of every student, and who needs action now.",
    classUrl: (p) => `/teacher/reports/early-warning?${qs({ classId: p.classId })}`,
    files: (p) => [{ label: "Excel", href: `/api/reports?${qs({ kind: "warning", format: "xlsx", lang: "en", period: "TERM", scope: "class", classId: p.classId })}` }, { label: "PDF file", href: `/api/reports?${qs({ kind: "warning", format: "pdf", lang: "en", period: "TERM", scope: "class", classId: p.classId, print: 1 })}` }],
    match: on(/^\/teacher\/reports\/early-warning$/, "class") },
  { key: "family-reports", category: "Follow-up", line: "mail", title: "Family Reports", hint: "Monthly and weekly reports for parents: you add a note, the school admin approves.", send: true,
    classUrl: (p) => `/teacher/family-reports?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/family-reports$/, "class") },
  { key: "map-family", category: "Follow-up", line: "family", title: "MAP family report", hint: "Achievement and growth for parents.", send: true,
    classUrl: (p) => `/map-report/class/${id(p.classId)}/family`,
    studentUrl: (p) => `/map-report/family/${id(p.studentId)}`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/family$/, "class"), on(/^\/map-report\/family\/(?<studentId>[^/]+)$/, "student")) },
];

/**
 * The hub's links to pages that are their programme's own home (they keep their own class chips, so no report bar):
 * listed in the hub so every report is found in one place, never copied. `pending`: arrives with another branch.
 */
export interface HubLink { key: string; category: ReportCategory; line: LineIconName; title: string; hint: string; href: (classId: string) => string; nafs?: boolean; pending?: boolean }
export const HUB_LINKS: HubLink[] = [
  // ⭐ the Skills grid (the skill-status stars, every student × skill) — its page arrives from the skill-status branch
  { key: "skills-grid", category: "My class", line: "star", title: "Student Skills", hint: "Every student and every skill: the stars at a glance.", href: (c) => `/teacher/reports/skills-grid${c ? `?${qs({ classId: c })}` : ""}`, pending: true },
  { key: "nafs-reports", category: "Programs", line: "flag", title: "NAFS reports", hint: "NAFS tests and practice: results by student and skill.", href: () => "/teacher/nafs?tab=reports", nafs: true },
  { key: "readrise-growth", category: "Programs", line: "rise", title: "ReadRise report", hint: "ReadRise levels over the year, the reading checks, who is stuck or rising fast, accuracy by question type.", href: (c) => `/teacher/readrise/report${c ? `?${qs({ class: c })}` : ""}` },
  { key: "learn-results", category: "Programs", line: "learn", title: "Learn results", hint: "Each lesson: who finished, scores, who needs it again.", href: () => "/teacher/learn" },
  { key: "fluency", category: "Programs", line: "mic", title: "Reading Fluency", hint: "Words correct per minute and progress of every student.", href: (c) => `/teacher/fluency${c ? `?${qs({ classId: c })}` : ""}` },
  { key: "alerts", category: "Follow-up", line: "bell", title: "Alerts", hint: "Who needs attention now (practice, MAP flags, reviews due) and what was done.", href: (c) => `/teacher/alerts${c ? `?${qs({ classId: c })}` : ""}` },
  { key: "interventions", category: "Follow-up", line: "users", title: "Interventions", hint: "Small groups on one skill, with before and after.", href: (c) => `/teacher/intervention/groups${c ? `?${qs({ class: c })}` : ""}` },
];

/** One card of the hub (a report or a link), in the group's order. */
export interface HubCard { key: string; category: ReportCategory; line: LineIconName; title: string; hint: string; report?: ReportDef; link?: HubLink }
export function hubCards(o: { nafs: boolean }): HubCard[] {
  const order: Record<string, number> = { "class-progress": 0, "skills-grid": 1, errors: 2, "class-dashboard": 3 };
  const all: HubCard[] = [
    ...REPORTS.map((r) => ({ key: r.key, category: r.category, line: r.line, title: r.title, hint: r.hint, report: r })),
    ...HUB_LINKS.filter((l) => !l.nafs || o.nafs).map((l) => ({ key: l.key, category: l.category, line: l.line, title: l.title, hint: l.hint, link: l })),
  ];
  return REPORT_CATEGORIES.flatMap((c) => all.filter((x) => x.category === c.key).sort((a, b) => (order[a.key] ?? 50) - (order[b.key] ?? 50)));
}

/** Old report keys (the wizard's, and the cards merged in r67) → the page that has them now. */
export const MOVED_REPORTS: Record<string, string> = {
  "student-page": "/teacher/students", assessments: "/teacher/assessments", diagnostic: "/teacher/diagnostic",
  readrise: "/teacher/readrise", fluency: "/teacher/fluency",
  "student-progress": "/teacher/students", "needs-help": "/teacher/reports/errors", "family-progress": "/teacher/family-reports",
};

/** The people a report can be about, in the order offered. */
export function scopesOf(r: ReportDef): ReportScope[] {
  return [...(r.classUrl ? ["class" as const] : []), ...(r.studentUrl ? ["student" as const] : [])];
}

/** The page for one report: the class version, or the student version for a student (or when there is no class one). */
export function reportUrl(r: ReportDef, scope: ReportScope, t: ReportTarget): string | null {
  if (scope === "class" && r.classUrl) return r.classUrl(t);
  if (r.studentUrl && t.studentId) return r.studentUrl({ ...t, studentId: t.studentId });
  return r.classUrl ? r.classUrl(t) : null;
}

/** Kept for older callers: one page per student for a per-student report, else the class page. */
export function reportUrls(r: ReportDef, scope: ReportScope, t: ReportTarget, studentIds: string[] = []): { studentId?: string; url: string }[] {
  if (scope === "class" && r.classUrl) return [{ url: r.classUrl(t) }];
  if (!r.studentUrl) return [];
  const ids = scope === "student" ? (t.studentId ? [t.studentId] : []) : studentIds;
  return ids.map((studentId) => ({ studentId, url: r.studentUrl!({ ...t, studentId }) }));
}

/**
 * Clicking a report opens it straight away: the class version for the class (or the given student's version),
 * on the current term. A student-only report needs a student (`firstStudent` = the class's first one).
 */
export function openReportUrl(r: ReportDef, o: { classId: string; studentId?: string; period?: ReportPeriod; firstStudent?: string }): string | null {
  const period = o.period ?? DEFAULT_PERIOD;
  if (o.studentId && r.studentUrl) return r.studentUrl({ classId: o.classId, studentId: o.studentId, period });
  if (r.classUrl) return r.classUrl({ classId: o.classId, period });
  const sid = o.studentId ?? o.firstStudent;
  return r.studentUrl && sid ? r.studentUrl({ classId: o.classId, studentId: sid, period }) : null;
}

/** Which report (if any) this address shows, and for whom. `search` may start with "?" and may carry Next's _rsc. */
export function matchReport(path: string, search = ""): { report: ReportDef; at: ReportMatch } | null {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  q.delete("_rsc");
  const clean = path.replace(/\/+$/, "") || "/";
  for (const report of REPORTS) { const at = report.match(clean, q); if (at) return { report, at }; }
  return null;
}

/** The query values a report page keeps when the class, student or range changes (e.g. MAP Reading / Language). */
export function carryQuery(url: string, from: string): string {
  const q = new URLSearchParams(from.startsWith("?") ? from.slice(1) : from);
  const subject = q.get("subject");
  if (!subject || !/[?&]subject=/.test(url)) return url;
  return url.replace(/([?&]subject=)[^&]*/, `$1${encodeURIComponent(subject)}`);
}

export const reportByKey = (key: string | undefined): ReportDef | undefined => REPORTS.find((r) => r.key === key);
