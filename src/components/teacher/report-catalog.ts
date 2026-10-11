/**
 * 📊 The Reports hub's catalogue: every report a teacher can open, in seven categories, with the people it can be
 * about (class / student / group) and the existing page that shows it (query params carry the class, student and
 * period). Pure data: the wizard page (/teacher/reports) and the tests read it. Labels are UI strings (src/i18n/en.ts).
 */
export type ReportScope = "class" | "student" | "group";
export type ReportPeriod = "week" | "month" | "term";
export type ReportCategory = "Class" | "Student" | "Skills" | "Tests" | "MAP" | "Reading" | "Games";

export const REPORT_CATEGORIES: { key: ReportCategory; icon: string }[] = [
  { key: "Class", icon: "🏫" }, { key: "Student", icon: "🧑‍🎓" }, { key: "Skills", icon: "🧩" }, { key: "Tests", icon: "📝" },
  { key: "MAP", icon: "🗺️" }, { key: "Reading", icon: "📖" }, { key: "Games", icon: "🎮" },
];

export const REPORT_PERIODS: { key: ReportPeriod; label: string; days: number; range: string }[] = [
  { key: "week", label: "This week", days: 7, range: "LAST_7_DAYS" },
  { key: "month", label: "This month", days: 30, range: "LAST_30_DAYS" },
  { key: "term", label: "This term", days: 120, range: "TERM" },
];

export interface ReportTarget { classId: string; studentId?: string; period: ReportPeriod }
export interface ReportDef {
  key: string; category: ReportCategory; title: string; hint: string;
  /** the page for the whole class (absent = no class version) */
  classUrl?: (p: ReportTarget) => string;
  /** the page for one student (absent = no student version); a group = this page for each student of the group */
  studentUrl?: (p: ReportTarget & { studentId: string }) => string;
  /** the report takes a period */
  period?: boolean;
  /** "Send to parents" after the preview (the school admin approves first) */
  send?: boolean;
}

const per = (p: ReportTarget) => REPORT_PERIODS.find((x) => x.key === p.period) ?? REPORT_PERIODS[1];
const qs = (o: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
const id = (v: string) => encodeURIComponent(v);

export const REPORTS: ReportDef[] = [
  // Class
  { key: "class-dashboard", category: "Class", title: "Students dashboard", hint: "Progress, accuracy and status of every student.",
    classUrl: (p) => `/teacher/progress?${qs({ classId: p.classId })}` },
  { key: "practice", category: "Class", title: "Practice and time", hint: "Questions and minutes by day, by skill and per student.", period: true,
    classUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p).range })}`,
    studentUrl: (p) => `/teacher/practice-analytics?${qs({ classId: p.classId, range: per(p).range, student: p.studentId })}` },
  { key: "family-progress", category: "Class", title: "Progress report for parents", hint: "A short report for the family. The school admin approves it before parents see it.", send: true,
    studentUrl: (p) => `/teacher/progress/${id(p.studentId)}/report` },
  // Student
  { key: "student-page", category: "Student", title: "Student page", hint: "Work, plans, tests, MAP, skills and reports of one student.",
    studentUrl: (p) => `/teacher/students/${id(p.studentId)}` },
  { key: "student-file", category: "Student", title: "Student file", hint: "Everything about one student on one printable page.",
    studentUrl: (p) => `/admin/student-file/${id(p.studentId)}` },
  // Skills
  { key: "curriculum-results", category: "Skills", title: "Curriculum results", hint: "How the class did on each unit and skill.",
    classUrl: (p) => `/teacher/curriculum-results?${qs({ classId: p.classId })}` },
  { key: "grammar", category: "Skills", title: "Grammar results", hint: "Grammar skills: mastery, common errors, what to reteach.", period: true,
    classUrl: (p) => `/teacher/reports/grammar?${qs({ classId: p.classId, days: per(p).days })}`,
    studentUrl: (p) => `/teacher/reports/grammar/${id(p.studentId)}?${qs({ days: per(p).days })}` },
  // Tests
  { key: "assessments", category: "Tests", title: "Test results", hint: "Your tests and their results by skill.",
    classUrl: (p) => `/teacher/assessments?${qs({ classId: p.classId })}` },
  { key: "diagnostic", category: "Tests", title: "Diagnostic results", hint: "Strengths and next steps from the Diagnostic.",
    classUrl: (p) => `/teacher/diagnostic?${qs({ classId: p.classId })}` },
  // MAP
  { key: "map-profile", category: "MAP", title: "MAP profile", hint: "RIT, percentile bands and the areas to work on.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/profile?subject=READING`,
    studentUrl: (p) => `/map-report/profile/${id(p.studentId)}` },
  { key: "map-family", category: "MAP", title: "MAP family report", hint: "Achievement and growth for parents.",
    classUrl: (p) => `/map-report/class/${id(p.classId)}/family`,
    studentUrl: (p) => `/map-report/family/${id(p.studentId)}` },
  { key: "map-growth", category: "MAP", title: "MAP Growth Report", hint: "Who reached the expected growth.",
    classUrl: () => "/teacher/growth" },
  // Reading
  { key: "readmaster", category: "Reading", title: "ReadMaster", hint: "By student, by text and by skill.", period: true,
    classUrl: (p) => `/teacher/reports/readmaster?${qs({ classId: p.classId, days: per(p).days })}`,
    studentUrl: (p) => `/teacher/reports/readmaster/${id(p.studentId)}?${qs({ days: per(p).days })}` },
  { key: "readrise", category: "Reading", title: "ReadRise", hint: "Reading level start, now and growth.",
    classUrl: (p) => `/teacher/readrise?${qs({ class: p.classId })}` },
  { key: "fluency", category: "Reading", title: "Reading Fluency", hint: "Words correct per minute and the words to practise.",
    classUrl: (p) => `/teacher/fluency?${qs({ classId: p.classId })}` },
  // Games
  { key: "live-games", category: "Games", title: "Live Challenge results", hint: "Participation and accuracy by skill in live games.", period: true,
    classUrl: (p) => `/teacher/reports/games?${qs({ classId: p.classId, days: per(p).days })}` },
  { key: "games-usage", category: "Games", title: "Games Report", hint: "The most played and best rated games.", period: true,
    classUrl: (p) => `/teacher/reports/games-usage?${qs({ classId: p.classId, days: per(p).days })}` },
];

/** The people a report can be about, in the order offered. */
export function scopesOf(r: ReportDef): ReportScope[] {
  return [...(r.classUrl || r.studentUrl ? ["class" as const] : []), ...(r.studentUrl ? ["student" as const, "group" as const] : [])];
}

/**
 * The page(s) to preview: a class report = one page; a per-student report for a class or a group = one page for
 * each student (`studentIds`, in order).
 */
export function reportUrls(r: ReportDef, scope: ReportScope, t: ReportTarget, studentIds: string[] = []): { studentId?: string; url: string }[] {
  if (scope === "class" && r.classUrl) return [{ url: r.classUrl(t) }];
  if (!r.studentUrl) return [];
  const ids = scope === "student" ? (t.studentId ? [t.studentId] : []) : studentIds;
  return ids.map((studentId) => ({ studentId, url: r.studentUrl!({ ...t, studentId }) }));
}

export const reportByKey = (key: string | undefined): ReportDef | undefined => REPORTS.find((r) => r.key === key);
