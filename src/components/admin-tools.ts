import type { Permission } from "@/server/auth/rbac";

/**
 * Every WORKING admin tool in ONE list (the Admin Home, the admin side menu and All Admin Tools read it), under five
 * sections: School · Content · Assessments & Programs · Reports · Settings.
 * - `menu`: in the side menu (≤ 6 per section);
 * - `home`: a tile on the Admin Home (≤ 6 per section, with a one-line `hint`);
 * - neither: only on All Admin Tools (searchable) and in the top bar's "Find a page".
 * `perm` hides a tool from admins who may not use it (any of the listed permissions). Labels and hints are English
 * source strings (src/i18n/en.ts). Every page here was opened against the demo school (tests/admin-review.test.ts).
 * Pages that only forwarded to another page left the lists (REMOVED_ADMIN_ROUTES; docs/WHAT-MOVED-WHERE.md).
 * The question pages (review, flags, quality, gaps, imports…) open from the Questions page: one "Questions" entry here.
 */
export type AdminGroupKey = "school" | "content" | "programs" | "reports" | "settings";

export const ADMIN_GROUPS: { key: AdminGroupKey; title: string; blurb: string }[] = [
  { key: "school", title: "School", blurb: "People, classes and the school year" },
  { key: "content", title: "Content", blurb: "Questions, reading and the curriculum" },
  { key: "programs", title: "Assessments & Programs", blurb: "Tests, MAP, NAFS, levels and RTI" },
  { key: "reports", title: "Reports", blurb: "How the school is doing" },
  { key: "settings", title: "Settings", blurb: "Setup, AI, backup and clean data" },
];

export interface AdminTool {
  href: string; label: string; icon: string; group: AdminGroupKey;
  hint?: string; home?: boolean; menu?: boolean; perm?: Permission | Permission[];
  /** the page opens for the school admin only (not the platform admin) */
  schoolAdminOnly?: boolean;
}

export const ADMIN_TOOLS: AdminTool[] = [
  // ---- School
  { href: "/admin/school", label: "School Overview", icon: "🏫", group: "school", home: true, menu: true, hint: "Classes, teachers and the school year", perm: "classes:manage" },
  { href: "/admin/users", label: "Users", icon: "👥", group: "school", home: true, menu: true, hint: "Students, teachers, parents and classes", perm: ["students:manage", "teachers:manage"] },
  { href: "/teacher/students", label: "Find a Student", icon: "🔎", group: "school", home: true, menu: true, hint: "Any student’s full file", perm: "reports:read" },
  { href: "/admin/teachers", label: "Teacher Follow-Up", icon: "🧑‍🏫", group: "school", home: true, menu: true, hint: "Each teacher’s classes and work", perm: "analytics:school" },
  { href: "/admin/messages", label: "Messages to Teachers", icon: "✉️", group: "school", home: true, hint: "Write to all teachers or a grade", perm: "teachers:manage" },
  { href: "/admin/student-cards", label: "Student Sign-in Cards", icon: "🪪", group: "school", home: true, hint: "Print usernames and QR codes", perm: "students:manage" },
  { href: "/admin/visit", label: "Class Visit", icon: "👀", group: "school", perm: "reports:read" },
  { href: "/admin/logins", label: "Sign-Ins", icon: "🔑", group: "school" },
  { href: "/teacher/levels", label: "Student Levels", icon: "🎚", group: "school", perm: "students:read", schoolAdminOnly: true },
  { href: "/admin/cancel-skill", label: "Cancel a Skill", icon: "🚫", group: "school", menu: true, hint: "Remove one skill from any student’s My Work", perm: "assignments:create" },
  { href: "/admin/roster/clean", label: "Clear Roster", icon: "🧹", group: "school", perm: "students:manage" },

  // ---- Content
  { href: "/admin/questions", label: "Questions", icon: "📚", group: "content", home: true, menu: true, hint: "Search, preview and edit every question", perm: "questions:read" },
  { href: "/admin/coverage", label: "Coverage Report", icon: "📊", group: "content", hint: "Every MAP skill: linked to the bank? how many questions?", perm: "questions:read" },
  { href: "/admin/skill-links", label: "Sort Questions", icon: "🧺", group: "content", home: true, menu: true, hint: "Check each question’s skill link", perm: "curriculum:edit" },
  { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", group: "content", home: true, menu: true, hint: "Grades 4–6: units, text sets and levels", perm: "curriculum:read" },
  { href: "/admin/readrise", label: "ReadRise Library", icon: "🚀", group: "content", home: true, menu: true, hint: "Articles for every reading level", perm: "questions:read" },
  { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", group: "content", home: true, menu: true, hint: "One article, three reading levels" },
  { href: "/admin/grammar", label: "Grammar", icon: "🔤", group: "content", home: true, menu: true, hint: "Every grade’s grammar skills", perm: "questions:read" },
  { href: "/admin/questions/duplicates", label: "Duplicate Questions", icon: "👯", group: "content", perm: "questions:read" },
  { href: "/admin/readmaster", label: "Manage ReadMaster", icon: "🛠", group: "content", perm: "questions:read" },
  { href: "/admin/dictionary", label: "Dictionary", icon: "📖", group: "content" },
  { href: "/admin/curriculum", label: "Curriculum Editor", icon: "✏️", group: "content", perm: "curriculum:edit" },
  { href: "/admin/skills", label: "Skills", icon: "🧩", group: "content", perm: "curriculum:edit" },
  { href: "/admin/map-links", label: "Bank ↔ MAP", icon: "🔗", group: "content", perm: "curriculum:edit" },
  { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", group: "content", perm: "questions:read" },

  // ---- Assessments & Programs
  { href: "/admin/tests", label: "Tests by Teacher", icon: "🧪", group: "programs", home: true, menu: true, hint: "Every teacher’s tests and results" },
  { href: "/admin/diagnostic", label: "Diagnostic Test", icon: "🩺", group: "programs", home: true, menu: true, hint: "The placement test and its results", perm: "reports:read" },
  { href: "/teacher/map-center", label: "MAP", icon: "🗺️", group: "programs", home: true, menu: true, hint: "Scores, plans and reports", perm: "reports:read" },
  { href: "/admin/nafs-links", label: "Bank ↔ NAFS", icon: "🪢", group: "programs", home: true, menu: true, hint: "NAFS standards linked to the questions", perm: "curriculum:edit" },
  { href: "/admin/levels", label: "Approaching / Meeting / Exceeding", icon: "⚖️", group: "programs", home: true, menu: true, hint: "Levels by grade, class and strand", perm: "analytics:school" },
  { href: "/teacher/rti-plan", label: "RTI Weekly Plan", icon: "🗓", group: "programs", home: true, menu: true, hint: "RTI groups and weekly sessions", perm: "reports:read" },
  { href: "/admin/tiers", label: "Support Tiers", icon: "🪜", group: "programs" },
  { href: "/teacher/map-rit", label: "MAP Scores", icon: "📥", group: "programs", perm: "reports:read" },
  { href: "/teacher/map-test", label: "MAP Test", icon: "🎯", group: "programs", perm: "reports:read" },
  { href: "/admin/map-classification", label: "MAP Classification", icon: "🗃️", group: "programs" },
  { href: "/admin/map-continuum", label: "Learning Continuum", icon: "📘", group: "programs", perm: "settings:school" },
  { href: "/teacher/plans", label: "Skill Plans", icon: "🗂️", group: "programs", perm: "assignments:read", schoolAdminOnly: true },
  { href: "/admin/readrise/dashboard", label: "ReadRise Growth", icon: "📈", group: "programs", perm: "analytics:school" },
  { href: "/admin/assessment-calendar", label: "Assessment Calendar", icon: "🗓️", group: "programs", perm: "settings:school" },
  { href: "/teacher/progress-checks", label: "Progress Checks", icon: "✅", group: "programs", perm: "reports:read" },
  { href: "/teacher/data-meeting", label: "Data Meeting", icon: "🗂", group: "programs" },
  { href: "/teacher/learning-loop", label: "Teach · Check · Reteach", icon: "🔄", group: "programs" },
  { href: "/teacher/knowledge-graph", label: "Skill Connections", icon: "🕸️", group: "programs" },
  { href: "/admin/learning-engine", label: "Learning Engine", icon: "⚙️", group: "programs" },

  // ---- Reports
  { href: "/admin/analytics", label: "Analytics", icon: "📐", group: "reports", home: true, menu: true, hint: "Practice and results across the school", perm: "analytics:school" },
  { href: "/admin/term-report", label: "End-of-Term Report", icon: "🧾", group: "reports", home: true, menu: true, hint: "One printable report for leadership", perm: "reports:read" },
  { href: "/admin/report-approvals", label: "Reports to Approve", icon: "📨", group: "reports", home: true, menu: true, hint: "Family reports wait for you" },
  { href: "/teacher/reports", label: "Reports", icon: "📊", group: "reports", home: true, menu: true, hint: "Every report in one place", perm: "reports:read" },
  { href: "/school-reports", label: "School Reports", icon: "🗒️", group: "reports", home: true, hint: "Personalized Plans, Diagnostic Analysis and the Final Report, per student", perm: "reports:read" },
  { href: "/admin/department", label: "Department Week", icon: "🏛", group: "reports", home: true, menu: true, hint: "Every class side by side this week", perm: "reports:read" },
  { href: "/admin/ai-dashboard", label: "School Insights", icon: "🔮", group: "reports", hint: "Trends, predictions and what works" },
  { href: "/admin/performance", label: "Teacher & Student Performance", icon: "🏆", group: "reports", perm: "analytics:school" },
  { href: "/admin/school-goals", label: "School Goals", icon: "🎯", group: "reports", perm: "settings:school" },
  { href: "/teacher/grade-summary", label: "Grade Summary", icon: "🧮", group: "reports" },
  { href: "/teacher/intervention", label: "Who Needs Help", icon: "🚨", group: "reports" },
  { href: "/teacher/alerts", label: "Alerts", icon: "🔔", group: "reports" },
  { href: "/teacher/ai", label: "Class Insights", icon: "💡", group: "reports" },

  // ---- Settings
  { href: "/admin/settings", label: "Settings", icon: "⚙", group: "settings", home: true, menu: true, hint: "Calendar, classes, branding, engine" },
  { href: "/admin/ai-tools", label: "AI Tools", icon: "🤖", group: "settings", home: true, menu: true, hint: "AI helpers and their settings", perm: "questions:publish" },
  { href: "/admin/backup", label: "Backup", icon: "💾", group: "settings", home: true, menu: true, hint: "Every score and plan in one Excel file", perm: "reports:export" },
  { href: "/admin/data-health", label: "Data Health", icon: "❤️‍🩹", group: "settings", home: true, menu: true, hint: "Problems in the data, with fixes", perm: "reports:read" },
  { href: "/admin/data-cleanup", label: "Data Cleanup", icon: "🧽", group: "settings", home: true, menu: true, hint: "Fix-it cards: one count, one button", perm: "students:manage" },
  { href: "/admin/feedback", label: "Feedback", icon: "💬", group: "settings", home: true, menu: true, hint: "What users told you" },
  { href: "/admin/connections", label: "Connections", icon: "🔌", group: "settings", perm: "reports:read" },
  { href: "/admin/errors", label: "Errors", icon: "🧯", group: "settings", perm: "settings:school" },
  { href: "/admin/system", label: "System check", icon: "🧱", group: "settings", hint: "Is the database up to date with the code?" },
  { href: "/admin/server-status", label: "Server status", icon: "🖥", group: "settings", hint: "Memory, uptime and the database — a glance before something goes wrong" },
  { href: "/guide", label: "Help", icon: "❔", group: "settings" },
];

/**
 * Admin pages that only forwarded to another page (or duplicated it): off the menu, the home and All Admin Tools;
 * the address still opens and goes to `to` (old bookmarks and links keep working).
 */
export const REMOVED_ADMIN_ROUTES: { from: string; to: string; why: string }[] = [
  { from: "/admin/quick-students", to: "/admin/school?open=add-student", why: "Quick add lives on the School page" },
  { from: "/admin/class-transfer", to: "/admin/school?open=teacher", why: "Change teacher lives on the School page" },
  { from: "/admin/roster", to: "/admin/school?open=roster", why: "Upload roster lives on the School page" },
  { from: "/admin/student-file", to: "/teacher/students", why: "Find a Student = My Students (each name opens the file)" },
];

/** The page with every admin tool, searchable (2 clicks from anywhere: menu → tool). */
export const ALL_TOOLS_HREF = "/admin/all";
