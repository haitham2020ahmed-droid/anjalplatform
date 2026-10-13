/**
 * 📊 The Reports catalogue: every report a teacher can open, in five groups (Class · Student · Skills · MAP · Family),
 * with the page that shows it for a class and / or one student, whether it takes a date range, its Excel / CSV
 * downloads and whether it can be sent to the family. Pure data + pure helpers (no server code):
 *  - the Reports page (/teacher/reports) draws the cards and opens a report straight away (openReportUrl);
 *  - the report bar on top of every report page (src/components/teacher/report-bar.tsx) finds the report from the
 *    address (matchReport) and offers the class switcher, the student picker, the date range, Download and Send.
 * Pages that belong to another area (a test's results → Assessments, ReadRise / Fluency → Reading, the student
 * profile → Students & Classes) are not repeated here: every page lives in ONE place.
 */
import type { LineIconName } from "../ui/line-icon";

export type ReportScope = "class" | "student";
export type ReportPeriod = "week" | "month" | "term";
export type ReportCategory = "Class" | "Student" | "Skills" | "MAP" | "Family";

export const REPORT_CATEGORIES: { key: ReportCategory; line: LineIconName; hint: string }[] = [
  { key: "Class", line: "school", hint: "The whole class at a glance." },
  { key: "Student", line: "student", hint: "One student in depth." },
  { key: "Skills", line: "puzzle", hint: "Skill by skill: what is mastered and what to reteach." },
  { key: "MAP", line: "target", hint: "MAP Growth: profiles, groups, study plans and growth." },
  { key: "Family", line: "family", hint: "Reports for parents." },
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
  (["pdf", "xlsx", "csv"] as const).map((format) => ({ label: { pdf: "PDF file", xlsx: "Excel", csv: "CSV" }[format], href: `/api/reports?${qs({ kind, format, lang: "en", period: "TERM", ...o })}` }));

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
  // ---- Class
  { key: "class-dashboard", category: "Class", line: "grid", title: "Students dashboard", hint: "Progress, accuracy and status of every student.",
    classUrl: (p) => `/teacher/progress?${qs({ classId: p.classId })}`,
    files: (p) => [{ label: "Excel · Reading", href: `/api/progress-export?${qs({ classId: p.classId, subject: "READING" })}` }, { label: "Excel · Language", href: `/api/progress-export?${qs({ classId: p.classId, subject: "LANGUAGE" })}` }],
    match: on(/^\/teacher\/progress$/, "class") },
  { key: "practice", category: "Class", line: "clock", title: "Practice and time", hint: "Questions and minutes by day, by skill and per student.", period: true,
    classUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p.period).range })}`,
    studentUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p.period).range, student: p.studentId })}`,
    match: on(/^\/teacher\/practice-analytics$/, byStudentParam("student")) },
  { key: "writing", category: "Class", line: "pen", title: "Writing results", hint: "Rubric scores (%) of graded writing, by student and task.",
    classUrl: (p) => `/teacher/writing/report?${qs({ classId: p.classId })}`,
    studentUrl: (p) => `/teacher/writing/report?${qs({ classId: p.classId, studentId: p.studentId })}`,
    match: on(/^\/teacher\/writing\/report$/, byStudentParam("studentId")) },
  { key: "readmaster", category: "Class", line: "book", title: "ReadMaster", hint: "By student, by text and by skill.", period: true,
    classUrl: (p) => `/teacher/reports/readmaster?${qs({ classId: p.classId, days: per(p.period).days })}`,
    studentUrl: (p) => `/teacher/reports/readmaster/${id(p.studentId)}?${qs({ days: per(p.period).days })}`,
    files: (p) => (p.scope === "class" ? apiFiles("readmaster", { classId: p.classId, days: per(p.period).days }) : []),
    match: either(on(/^\/teacher\/reports\/readmaster\/(?<studentId>[^/]+)$/, "student"), on(/^\/teacher\/reports\/readmaster$/, "class")) },
  { key: "live-games", category: "Class", line: "game", title: "Live Challenge results", hint: "Participation and accuracy by skill in live games.", period: true,
    classUrl: (p) => `/teacher/reports/games?${qs({ classId: p.classId, days: per(p.period).days })}`,
    files: (p) => apiFiles("games", { classId: p.classId, days: per(p.period).days }),
    match: on(/^\/teacher\/reports\/games$/, "class") },
  { key: "games-usage", category: "Class", line: "star", title: "Games Report", hint: "The most played and best rated games.", period: true,
    classUrl: (p) => `/teacher/reports/games-usage?${qs({ classId: p.classId, days: per(p.period).days })}`,
    match: on(/^\/teacher\/reports\/games-usage$/, "class") },
  // ---- Student
  { key: "student-progress", category: "Student", line: "growth", title: "Student Progress", hint: "One student's work, accuracy, skills and MAP over time.",
    studentUrl: (p) => `/teacher/progress/${id(p.studentId)}`,
    match: on(/^\/teacher\/progress\/(?<studentId>[^/]+)$/, "student") },
  { key: "student-file", category: "Student", line: "file", title: "Student file", hint: "Everything about one student on one printable page.",
    studentUrl: (p) => `/admin/student-file/${id(p.studentId)}`,
    match: on(/^\/admin\/student-file\/(?<studentId>[^/]+)$/, "student") },
  // ---- Skills
  { key: "curriculum-results", category: "Skills", line: "compass", title: "Curriculum results", hint: "How the class did on each unit and skill.",
    classUrl: (p) => `/teacher/curriculum-results?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/curriculum-results$/, "class") },
  { key: "grammar", category: "Skills", line: "layers", title: "Grammar results", hint: "Grammar skills: mastery, common errors, what to reteach.", period: true,
    classUrl: (p) => `/teacher/reports/grammar?${qs({ classId: p.classId, days: per(p.period).days })}`,
    studentUrl: (p) => `/teacher/reports/grammar/${id(p.studentId)}?${qs({ days: per(p.period).days })}`,
    files: (p) => (p.scope === "class" ? apiFiles("grammar", { classId: p.classId, days: per(p.period).days }) : []),
    match: either(on(/^\/teacher\/reports\/grammar\/(?<studentId>[^/]+)$/, "student"), on(/^\/teacher\/reports\/grammar$/, "class")) },
  { key: "needs-help", category: "Skills", line: "alert", title: "Needs help", hint: "Skills where a student answered the same question wrong twice.",
    classUrl: (p) => `/teacher/reports/needs-help?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/reports\/needs-help$/, "class") },
  // ---- MAP
  { key: "map-profile", category: "MAP", line: "target", title: "MAP profile", hint: "RIT, percentile bands and the areas to work on.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/profile?subject=READING`,
    studentUrl: (p) => `/map-report/profile/${id(p.studentId)}`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/profile$/, "class"), on(/^\/map-report\/profile\/(?<studentId>[^/]+)$/, "student")) },
  { key: "map-groups", category: "MAP", line: "users", title: "Group study plan", hint: "Students of the same RIT band together for each sub-area, with the skills.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/groups?subject=READING`,
    files: (p) => [{ label: "3-level group plan (Word)", href: `/api/personal-plan-doc?${qs({ classId: p.classId, subject: "reading" })}` }],
    match: on(/^\/map-report\/class\/(?<classId>[^/]+)\/groups$/, "class") },
  { key: "map-study-plans", category: "MAP", line: "plans", title: "MAP study plans", hint: "Each student's personal study plan from the MAP scores.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/study-plans?subject=READING`,
    studentUrl: (p) => `/map-report/study-plan/${id(p.studentId)}?subject=READING`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/study-plans$/, "class"), on(/^\/map-report\/study-plan\/(?<studentId>[^/]+)$/, "student")) },
  { key: "map-growth", category: "MAP", line: "growth", title: "MAP Growth Report", hint: "Every student's RIT and who reached the expected growth.",
    classUrl: (p) => `/teacher/map-center?${qs({ tab: "reports", classId: p.classId })}`,
    match: on(/^\/teacher\/map-center$/, "class", (q) => q.get("tab") === "reports" && q.get("view") !== "overview") },
  { key: "map-overview", category: "MAP", line: "chart", title: "Grade and school overview", hint: "Every grade and class side by side: mean RIT vs national, bands, growth.",
    classUrl: (p) => `/teacher/map-center?${qs({ tab: "reports", view: "overview", classId: p.classId })}`,
    match: on(/^\/teacher\/map-center$/, "class", (q) => q.get("tab") === "reports" && q.get("view") === "overview") },
  // ---- Family
  { key: "family-progress", category: "Family", line: "send", title: "Progress report for parents", hint: "A short report for the family. The school admin approves it before parents see it.", send: true,
    studentUrl: (p) => `/teacher/progress/${id(p.studentId)}/report`,
    match: on(/^\/teacher\/progress\/(?<studentId>[^/]+)\/report$/, "student") },
  { key: "map-family", category: "Family", line: "family", title: "MAP family report", hint: "Achievement and growth for parents.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/family`,
    studentUrl: (p) => `/map-report/family/${id(p.studentId)}`,
    match: either(on(/^\/map-report\/class\/(?<classId>[^/]+)\/family$/, "class"), on(/^\/map-report\/family\/(?<studentId>[^/]+)$/, "student")) },
  { key: "family-reports", category: "Family", line: "mail", title: "Family Reports", hint: "Every report shared with families and what waits for approval.",
    classUrl: (p) => `/teacher/family-reports?${qs({ classId: p.classId })}`,
    match: on(/^\/teacher\/family-reports$/, "class") },
];

/** Old report keys (the wizard's) → the page that has them now. */
export const MOVED_REPORTS: Record<string, string> = {
  "student-page": "/teacher/students", assessments: "/teacher/assessments", diagnostic: "/teacher/diagnostic",
  readrise: "/teacher/readrise", fluency: "/teacher/fluency",
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
