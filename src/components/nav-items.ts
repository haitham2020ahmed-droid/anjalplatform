import type { NavItem } from "./ui/main-nav";
import type { LineIconName } from "./ui/line-icon";
import { ADMIN_GROUPS, ADMIN_TOOLS, ALL_TOOLS_HREF } from "./admin-tools";

/** The side-menu group that starts folded for every role (rarely used pages). */
export const MORE = "More";
/** Kept for older imports: the admin's folded group is the same "More" as the other roles. */
export const MORE_TOOLS = MORE;

/**
 * r88 (owner request, Oct 2026): "More" split into themed, individually-folded sub-sections, so a long "More" (49
 * admin tools, 28 teacher pages) isn't one long flat list once opened. Same folding mechanism (side-nav.tsx
 * isMoreGroup), just more than one heading, each remembered open/closed on its own.
 */
export const MORE_GROUPS = {
  adminSchool: "More · School", adminContent: "More · Content", adminPrograms: "More · Assessments & Programs",
  adminReports: "More · Reports", adminSettings: "More · Settings",
  teacherSupport: "More · Support & Intervention", teacherReading: "More · Reading & Words",
  teacherDiagnostics: "More · Diagnostics & Checks", teacherMap: "More · MAP & Dashboards",
  studentReading: "More · Reading", studentAchievements: "More · My Achievements", otherTools: "More · Other Tools",
} as const;

export interface NavOpts {
  /** the student is in the RTI program (Tier 2/3) */
  rti?: boolean;
  /** student: in a Grade 6 class (src/server/student/menu-flags.ts); teacher: teaches a Grade 6 class (NAFS) */
  nafs?: boolean;
}

/**
 * Each role's menu: short, tidy, the rare pages folded under "More". Labels are English source strings
 * (src/i18n/en.ts); the shell translates them. Pages taken out of the menu still open (see docs/WHAT-MOVED-WHERE.md).
 */
export function navItemsFor(role: string, opts: NavOpts = {}): NavItem[] {
  // r87: nothing stays menu-only-by-search any more — every page that used to live only in OFF_MENU / adminOffMenu
  // (findable by name, not by an icon) is now also a real icon here. r88: those extra pages are themed into several
  // folded "More · …" sub-sections (MORE_GROUPS above) instead of one long flat "More".
  if (role === "TEACHER") {
    const nafsExtra = opts.nafs ? [{ ...NAFS_PLAN_PAGE, group: MORE_GROUPS.teacherMap }, { ...NAFS_DASHBOARD_PAGE, group: MORE_GROUPS.teacherMap }] : [];
    return [...(opts.nafs ? teacherMenuWithNafs() : TEACHER_MENU), ...OFF_MENU.TEACHER, ...nafsExtra];
  }
  if (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN") return [...adminMenu(), ...adminMoreExtras(opts)];
  if (role === "STUDENT") return [...studentMenu(opts), ...OFF_MENU.STUDENT];
  return [];
}

// ------------------------------------------------------------------ Student
/**
 * Home · My Work · My Tests · MAP · ReadMaster / ReadRise · Learn · My Words · Fluency (owner's spec) — plus NAFS for
 * students in a Grade 6 class only (the NAFS center, owner-approved plan). No RTI wording.
 * My Words = the one home of vocabulary (the Curriculum Map words + the words I saved; Learn links to it); Fluency =
 * the Fluency Coach, out of the reading hub (its own entry). Clean line icons (no emoji) and each page once.
 */
function studentMenu(opts: NavOpts): NavItem[] {
  return [
    { href: "/student", label: "Home", icon: "🏠", line: "home" },
    { href: "/student/work", label: "My Work", icon: "✅", line: "work" },
    // ⭐ My Skills (owner r68): right after My Work — Mastered · Learning · Review · Not started
    STUDENT_SKILLS_PAGE,
    // 📋 My Plans (owner r82): every plan the teacher sent me, by type (it had become a redirect and left the menu)
    STUDENT_PLANS_PAGE,
    { href: "/student/tests", label: "My Tests", icon: "📝", line: "tests" },
    { href: "/student/map", label: "MAP", icon: "🗺️", line: "map" },
    { href: "/student/reading", label: "ReadMaster / ReadRise", icon: "📚", line: "reading" },
    // 📘 Learn (owner-approved plan): short lessons for every skill (its Words moved to My Words)
    STUDENT_LEARN_PAGE,
    // 📒 My Words: the Curriculum Map words (Grades 4–6, with explanations) + "Words I saved"
    STUDENT_WORDS_PAGE,
    // 🎙️ Fluency: the Fluency Coach (its own entry, out of the reading hub)
    STUDENT_FLUENCY_PAGE,
    // 🇸🇦 the NAFS icon: ONLY for students in a Grade 6 class (menu-flags.ts inGrade6Class)
    ...(opts.nafs ? [STUDENT_NAFS_PAGE] : []),
  ];
}
/** The student's My Skills: every skill's ONE status in four tabs (src/app/student/skills, server/skills/my-skills.ts). */
export const STUDENT_SKILLS_PAGE: NavItem = { href: "/student/skills", label: "My Skills", icon: "⭐", line: "star" };
/** The student's My Plans: every live plan sent to me, grouped by type (src/app/student/plans, server/student/my-plans.ts). */
export const STUDENT_PLANS_PAGE: NavItem = { href: "/student/plans", label: "My Plans", icon: "📋", line: "plans" };
/** The student's Learn icon: lessons for every skill (src/app/student/learn); its "My Words" button opens My Words. */
export const STUDENT_LEARN_PAGE: NavItem = { href: "/student/learn", label: "Learn", icon: "📘", line: "learn" };
/** The student's My Words: the Curriculum Map words of Grades 4–6 + the words I saved (src/app/student/words). */
export const STUDENT_WORDS_PAGE: NavItem = { href: "/student/words", label: "My Words", icon: "📒", line: "words" };
/** The student's Fluency Coach (read aloud and get feedback): its own entry. */
export const STUDENT_FLUENCY_PAGE: NavItem = { href: "/student/fluency-coach", label: "Fluency", icon: "🎙️", line: "mic" };
/** The student's NAFS icon: My practice · My tests · My results (Grade 6 students only). */
export const STUDENT_NAFS_PAGE: NavItem = { href: "/student/nafs", label: "NAFS", icon: "🇸🇦", line: "flag" };

// ------------------------------------------------------------------ Teacher
/**
 * Every teacher page lives in ONE place (owner's spec, Update 15): each area below is the only way in to its pages
 * (no Home tiles, hub cards or second menu entries repeat them). Reports = every report (MAP reports too) · MAP = MAP
 * results, score entry and the MAP practice test · Plans = every plan (MAP, NAFS, curriculum, support, custom) ·
 * Reading = ReadMaster, ReadRise and Reading Fluency. The tools used now and then sit under "More" (folded).
 * NAFS (its own entry, added by navItemsFor) is only for teachers of a Grade 6 class and admins:
 * src/server/teacher/nafs-access.ts.
 */
export const TEACHER_MENU: NavItem[] = [
  { href: "/teacher", label: "Home", icon: "🏠", line: "home" },
  { href: "/teacher/students", label: "Students & Classes", icon: "👥", line: "users" },
  { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", line: "compass" },
  // 🔁 fix (Oct 2026, "عايز اضيف icon review"): its own menu entry, same place/style as Curriculum Map right above
  // it — not a second page, just a first direct doorway to "My Reviews" (previously only reachable from inside
  // Curriculum Map). Lets a teacher open/continue any Review, or start a brand-new whole-grade Review Builder by
  // picking a grade right there, without ever opening Curriculum Map.
  { href: "/teacher/my-reviews", label: "Review", icon: "🔁", line: "retry" },
  { href: "/teacher/plans", label: "Plans", icon: "🗂️", line: "plans" },
  // 📌 Assigned (owner r67): everything the teacher assigned, in one list, with Cancel / Undo
  { href: "/teacher/assigned", label: "Assigned", icon: "📌", line: "inbox" },
  { href: "/teacher/assessments", label: "Assessments", icon: "📝", line: "check" },
  { href: "/teacher/writing", label: "Writing", icon: "🖊", line: "pen" },
  // 🔤 Grammar (owner request): the Grammar bank browsing/assign page (admin/grammar/page.tsx allows TEACHER too).
  // Was only reachable via "Find a page" (OFF_MENU) — never shown as its own icon, so teachers could not find it
  // to assign Grammar, and students in turn never saw a Grammar group in My Skills (nothing was ever assigned).
  { href: "/admin/grammar", label: "Grammar", icon: "🔤", line: "words" },
  { href: "/teacher/reading", label: "Reading", icon: "📚", line: "book" },
  { href: "/teacher/learn", label: "Learn", icon: "📘", line: "learn" },
  { href: "/teacher/map-center", label: "MAP", icon: "🗺️", line: "target" },
  { href: "/teacher/reports", label: "Reports", icon: "📊", line: "chart" },
  { href: "/school-reports", label: "School Reports", icon: "🗒️", line: "file" },
  { href: "/teacher/week", label: "My Week", icon: "📅", line: "week", group: MORE },
  { href: "/teacher/messages", label: "Messages", icon: "📨", line: "mail", group: MORE },
  { href: "/teacher/games", label: "Live Challenge", icon: "🏁", line: "game", group: MORE },
  { href: "/teacher/class-signin", label: "Class sign-in", icon: "📱", line: "qr", group: MORE },
  { href: "/teacher/calendar", label: "Calendar", icon: "🗓️", line: "calendar", group: MORE },
  { href: "/guide", label: "Help", icon: "❔", line: "help", group: MORE },
];
/**
 * 🇸🇦 NAFS: its OWN menu entry (owner's spec), after Assessments, only for teachers of a Grade 6 class
 * (src/server/teacher/nafs-access.ts); admins find it by name. The section's tabs: About NAFS · Skills · Question
 * bank · Tests · Bubble sheets · Reports.
 */
export const NAFS_PAGE: NavItem = { href: "/teacher/nafs", label: "NAFS", icon: "🇸🇦", line: "flag" };
/** The NAFS plan (a tab of Plans, also linked from the NAFS section's Reports): found by name by the same people. */
export const NAFS_PLAN_PAGE: NavItem = { href: "/teacher/plans?tab=nafs", label: "NAFS plan", icon: "📃", line: "plans" };
/** The NAFS center's Dashboard (teachers of a Grade 6 class: their classes; admins: the whole school), found by name. */
export const NAFS_DASHBOARD_PAGE: NavItem = { href: "/teacher/nafs?tab=reports", label: "NAFS reports", icon: "🗞️", line: "chart" };
function teacherMenuWithNafs(): NavItem[] {
  const at = TEACHER_MENU.findIndex((i) => i.href === "/teacher/assessments") + 1;
  return [...TEACHER_MENU.slice(0, at), NAFS_PAGE, ...TEACHER_MENU.slice(at)];
}

/**
 * Pages that left a menu but still open (docs/WHAT-MOVED-WHERE.md): "Find a page" in the side menu still finds
 * them by name, so nobody loses a page they knew.
 */
const OFF_MENU: Record<"TEACHER" | "STUDENT", NavItem[]> = {
  // r88: grouped into 5 themed "More" sub-sections, each block kept contiguous so navSections() renders one
  // folded heading per theme instead of several broken-up runs of the same name.
  TEACHER: [
    // Support & Intervention
    { href: "/teacher/plans/support", label: "Support (RTI)", icon: "🛟", line: "puzzle", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/rti-plan", label: "Weekly Support Sessions", icon: "🗓", line: "calendar", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/lessons", label: "Intervention Lessons", icon: "🧩", line: "puzzle", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/intervention", label: "Who Needs Help", icon: "🚨", line: "alert", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/alerts", label: "Alerts", icon: "🔔", line: "bell", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/intervention/groups", label: "Intervention Groups", icon: "🎯", line: "target", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/strategy-groups", label: "Strategy Groups", icon: "🧠", line: "learn", group: MORE_GROUPS.teacherSupport },
    { href: "/teacher/learning-loop", label: "Teach · Check · Reteach", icon: "🔄", line: "retry", group: MORE_GROUPS.teacherSupport },
    // Reading & Words
    { href: "/teacher/decoding", label: "Decoding Screener", icon: "🔡", line: "words", group: MORE_GROUPS.teacherReading },
    { href: "/teacher/fluency", label: "Reading Fluency", icon: "🔊", line: "mic", group: MORE_GROUPS.teacherReading },
    { href: "/teacher/readrise", label: "ReadRise", icon: "🚀", line: "rise", group: MORE_GROUPS.teacherReading },
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", line: "star", group: MORE_GROUPS.teacherReading },
    { href: "/admin/dictionary", label: "Dictionary", icon: "📖", line: "book", group: MORE_GROUPS.teacherReading },
    { href: "/teacher/word-journal", label: "Word Journals", icon: "📒", line: "words", group: MORE_GROUPS.teacherReading },
    // Diagnostics & Checks
    { href: "/teacher/diagnostic", label: "Diagnostic Test", icon: "🩺", line: "check", group: MORE_GROUPS.teacherDiagnostics },
    { href: "/teacher/progress-checks", label: "Progress Checks", icon: "✅", line: "check", group: MORE_GROUPS.teacherDiagnostics },
    { href: "/teacher/levels", label: "Levels", icon: "🎚", line: "scale", group: MORE_GROUPS.teacherDiagnostics },
    // Other Tools
    { href: "/teacher/groups", label: "Groups", icon: "🤝", line: "users", group: MORE_GROUPS.otherTools },
    { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", line: "print", group: MORE_GROUPS.otherTools },
    { href: "/teacher/respond", label: "Respond to Reading", icon: "✍️", line: "writing", group: MORE_GROUPS.otherTools },
    { href: "/teacher/ai", label: "Class Insights", icon: "💡", line: "sparkle", group: MORE_GROUPS.otherTools },
    { href: "/teacher/family-reports", label: "Family Reports", icon: "👪", line: "family", group: MORE_GROUPS.otherTools },
    { href: "/teacher/assignments", label: "Assignments", icon: "📋", line: "inbox", group: MORE_GROUPS.otherTools },
    // MAP & Dashboards (last, so the conditional NAFS plan/reports extras in navItemsFor stay contiguous with it)
    { href: "/teacher/map-rit", label: "MAP Scores", icon: "📥", line: "map", group: MORE_GROUPS.teacherMap },
    { href: "/teacher/progress", label: "Students dashboard", icon: "📈", line: "growth", group: MORE_GROUPS.teacherMap },
    { href: "/teacher/map-center?tab=plan", label: "MAP plan", icon: "🧾", line: "map", group: MORE_GROUPS.teacherMap },
    { href: "/teacher/map-center?tab=reports", label: "MAP reports", icon: "📑", line: "chart", group: MORE_GROUPS.teacherMap },
    { href: "/teacher/knowledge-graph", label: "Skill Connections", icon: "🕸️", line: "layers", group: MORE_GROUPS.teacherMap },
  ],
  STUDENT: [
    // Reading
    { href: "/student/readmaster", label: "ReadMaster", icon: "📖", line: "star", group: MORE_GROUPS.studentReading },
    { href: "/student/readrise", label: "ReadRise", icon: "🚀", line: "rise", group: MORE_GROUPS.studentReading },
    { href: "/student/curriculum", label: "Curriculum Map", icon: "🧭", line: "curriculum", group: MORE_GROUPS.studentReading },
    // My Achievements
    { href: "/student/second-chance", label: "Second Chance", icon: "🌟", line: "retry", group: MORE_GROUPS.studentAchievements },
    { href: "/student/certificates", label: "My Certificates", icon: "📜", line: "award", group: MORE_GROUPS.studentAchievements },
    { href: "/student/badges", label: "Badges", icon: "🏅", line: "award", group: MORE_GROUPS.studentAchievements },
    { href: "/student/reports", label: "My Reports", icon: "📊", line: "chart", group: MORE_GROUPS.studentAchievements },
    { href: "/student/insights", label: "Progress Report", icon: "📈", line: "growth", group: MORE_GROUPS.studentAchievements },
    { href: "/student/family", label: "Family Report", icon: "👪", line: "family", group: MORE_GROUPS.studentAchievements },
    // Other Tools
    { href: "/student/lesson", label: "My Lessons", icon: "📑", line: "book", group: MORE_GROUPS.otherTools },
    { href: "/student/respond", label: "Respond to Reading", icon: "✍️", line: "writing", group: MORE_GROUPS.otherTools },
    { href: "/student/writing", label: "Writing", icon: "🖊", line: "writing", group: MORE_GROUPS.otherTools },
    { href: "/student/decoding", label: "Word Sounds Check", icon: "🔤", line: "words", group: MORE_GROUPS.otherTools },
    { href: "/student/strategy-survey", label: "My Reading Strategies", icon: "🧠", line: "sparkle", group: MORE_GROUPS.otherTools },
    { href: "/play", label: "Join Live", icon: "🎮", line: "play", group: MORE_GROUPS.otherTools },
    { href: "/guide", label: "Help", icon: "❔", line: "help", group: MORE_GROUPS.otherTools },
  ],
};

/** Every page a role can find by name: the menu, then the pages that left it (no duplicates). */
export function searchablePagesFor(role: string, opts: NavOpts = {}): NavItem[] {
  const menu = navItemsFor(role, opts);
  const extra = role === "TEACHER" ? [...OFF_MENU.TEACHER, ...(opts.nafs ? [NAFS_PLAN_PAGE, NAFS_DASHBOARD_PAGE] : [])] : role === "STUDENT" ? OFF_MENU[role]
    : role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN" ? [...adminOffMenu(), ...(opts.nafs === false ? [] : [NAFS_PAGE, NAFS_DASHBOARD_PAGE, NAFS_PLAN_PAGE]), ...ADMIN_LEARN_PAGES, ADMIN_ASSIGNED_PAGE] : [];
  const seen = new Set(menu.map((i) => i.href));
  return [...menu, ...extra.filter((i) => !seen.has(i.href))];
}

// ------------------------------------------------------------------ Admin
/**
 * Home · All Admin Tools, then the five sections (≤ 6 working tools each). Nothing is folded under "More": every
 * other admin tool is on All Admin Tools (searchable) and in the top bar's "Find a page" (adminOffMenu).
 */
function adminMenu(): NavItem[] {
  return [
    { href: "/admin", label: "Home", icon: "🏠", line: "home" },
    { href: ALL_TOOLS_HREF, label: "All Admin Tools", icon: "🧰", line: "tools" },
    ...ADMIN_GROUPS.flatMap((g) => ADMIN_TOOLS.filter((x) => x.menu && x.group === g.key).map((x) => ({ href: x.href, label: x.label, icon: x.icon, group: g.title, line: ADMIN_LINE[x.href] }))),
  ];
}

/**
 * 📘 Learn for the admin (found by name in the top bar; All Admin Tools is full): the lessons (preview, edit, assign,
 * Hide), the teachers' proposals and problem reports, and the coverage view.
 */
/** 📌 Assigned for the admin (found by name; also a shortcut on the admin home): every teacher's assigned work. */
export const ADMIN_ASSIGNED_PAGE: NavItem = { href: "/teacher/assigned", label: "Assigned", icon: "📌", line: "inbox" };

export const ADMIN_LEARN_PAGES: NavItem[] = [
  { href: "/teacher/learn", label: "Learn", icon: "📘", line: "learn" },
  { href: "/teacher/learn/review", label: "Proposals and reports", icon: "📬", line: "inbox" },
  { href: "/teacher/learn/coverage", label: "Learn coverage", icon: "🔍", line: "compass" },
];

/** The admin menu's calm line icons (Literise D1: no emoji in any menu), by page address. */
export const ADMIN_LINE: Record<string, LineIconName> = {
  "/admin/school": "school", "/admin/users": "users", "/teacher/students": "search", "/admin/teachers": "teacher",
  "/admin/questions": "question", "/admin/skill-links": "layers", "/admin/curriculum-map": "compass", "/admin/readrise": "rise",
  "/student/readmaster": "star", "/admin/grammar": "words", "/admin/tests": "tests", "/admin/diagnostic": "check",
  "/teacher/map-center": "target", "/admin/nafs-links": "link", "/admin/levels": "scale", "/teacher/rti-plan": "calendar",
  "/admin/analytics": "growth", "/admin/term-report": "file", "/admin/report-approvals": "inbox", "/teacher/reports": "chart",
  "/admin/department": "building", "/admin/ai-dashboard": "sparkle", "/admin/settings": "settings", "/admin/ai-tools": "sparkle",
  "/admin/backup": "download", "/admin/data-health": "heart", "/admin/data-cleanup": "broom", "/admin/feedback": "chat",
  "/admin/cancel-skill": "x", "/admin/performance": "award",
  // r87: the tools that used to be findable only by name now also get a line icon, since they're real "More" icons too.
  "/admin/messages": "mail", "/admin/student-cards": "qr", "/admin/visit": "eye", "/admin/logins": "lock",
  "/teacher/levels": "scale", "/admin/roster/clean": "broom", "/admin/coverage": "chart", "/admin/questions/duplicates": "layers",
  "/admin/readmaster": "tools", "/admin/dictionary": "book", "/admin/curriculum": "pen", "/admin/skills": "puzzle",
  "/admin/map-links": "link", "/teacher/worksheet": "print", "/admin/tiers": "scale", "/teacher/map-rit": "map",
  "/teacher/map-test": "target", "/admin/map-classification": "archive", "/admin/map-continuum": "book", "/teacher/plans": "plans",
  "/admin/readrise/dashboard": "growth", "/admin/assessment-calendar": "calendar", "/teacher/progress-checks": "check",
  "/teacher/data-meeting": "chat", "/teacher/learning-loop": "retry", "/teacher/knowledge-graph": "layers",
  "/admin/learning-engine": "settings", "/school-reports": "file", "/admin/nafs-item-analysis": "chart",
  "/admin/skill-overlap": "link", "/admin/practice-balance": "scale", "/admin/school-goals": "target",
  "/teacher/grade-summary": "chart", "/teacher/intervention": "alert", "/teacher/alerts": "bell", "/teacher/ai": "sparkle",
  "/admin/connections": "link", "/admin/errors": "alert", "/admin/system": "tools", "/admin/server-status": "chart",
  "/guide": "help",
};

/** The admin tools that are not in the side menu (found by name in the top bar, and now also a "More · …" line icon). */
function adminOffMenu(): NavItem[] {
  return ADMIN_TOOLS.filter((x) => !x.menu).map((x) => ({ href: x.href, label: x.label, icon: x.icon, line: ADMIN_LINE[x.href] }));
}

/** r88: every admin tool that isn't in the five top sections, themed into "More · <that same section's name>" — one
 * folded sub-section per ADMIN_GROUPS key, in that fixed order, so each stays a single contiguous run (never split
 * by the few extra pages — NAFS, Learn, Assigned — that aren't in ADMIN_TOOLS at all). */
function adminMoreExtras(opts: NavOpts): NavItem[] {
  const extraByGroup: Record<(typeof ADMIN_GROUPS)[number]["key"], NavItem[]> = { school: [], content: [...ADMIN_LEARN_PAGES], programs: [], reports: [], settings: [] };
  extraByGroup.programs.push(ADMIN_ASSIGNED_PAGE, ...(opts.nafs === false ? [] : [NAFS_PAGE, NAFS_DASHBOARD_PAGE, NAFS_PLAN_PAGE]));
  return ADMIN_GROUPS.flatMap((g) => [...ADMIN_TOOLS.filter((x) => !x.menu && x.group === g.key).map((x) => ({ href: x.href, label: x.label, icon: x.icon, line: ADMIN_LINE[x.href] })), ...extraByGroup[g.key]]
    .map((x) => ({ ...x, group: `More · ${g.title}` })));
}

/** The menu in its own order: a run of items of the same group is one section (items without a group stand alone). */
export function navSections(items: NavItem[]): { name: string | null; items: NavItem[] }[] {
  const out: { name: string | null; items: NavItem[] }[] = [];
  for (const i of items) {
    const key = i.group ?? null;
    const last = out[out.length - 1];
    if (last && last.name === key) last.items.push(i); else out.push({ name: key, items: [i] });
  }
  return out;
}
