import type { Permission } from "@/server/auth/rbac";

/**
 * Every admin tool in ONE list (the admin home, the admin side menu and "All Admin Tools" read it), grouped under
 * five short headings (School · Content · Assessments & Programs · Reports · Settings). `home` = a tile on the Admin
 * Home (the most used per group, with a one-line hint); `menu` = always visible in the side menu (the rest of the menu
 * pages are folded under "More");
 * `nav: false` = not in the side menu, only on the home / All Admin Tools. `perm` hides a tool from admins who
 * may not use it (any of the listed permissions). Labels and hints are English source strings (src/i18n/en.ts).
 * Nothing was removed: see uiro/admin/MENU-before-after.md (checked by tests/uiro-admin.test.ts).
 */
export type AdminGroupKey = "school" | "content" | "programs" | "reports" | "settings";

export const ADMIN_GROUPS: { key: AdminGroupKey; title: string; icon: string }[] = [
  { key: "school", title: "School", icon: "🏫" },
  { key: "content", title: "Content", icon: "📚" },
  { key: "programs", title: "Assessments & Programs", icon: "🧭" },
  { key: "reports", title: "Reports", icon: "📊" },
  { key: "settings", title: "Settings", icon: "⚙️" },
];

export interface AdminTool {
  href: string; label: string; icon: string; group: AdminGroupKey;
  hint?: string; home?: boolean; menu?: boolean; nav?: boolean; perm?: Permission | Permission[];
}

export const ADMIN_TOOLS: AdminTool[] = [
  // ---- School: people, classes and the school itself
  { href: "/admin/school", label: "School Overview", icon: "🏛", group: "school", home: true, menu: true, hint: "Classes, teachers and the school year" },
  { href: "/admin/users", label: "Users", icon: "👥", group: "school", home: true, menu: true, hint: "Students, teachers, parents and classes", perm: ["students:manage", "teachers:manage"] },
  { href: "/admin/student-file", label: "Find a Student", icon: "🔎", group: "school", home: true, menu: true, hint: "Any student’s full file", perm: "reports:read" },
  { href: "/admin/teachers", label: "Teacher Follow-Up", icon: "🧑‍🏫", group: "school", home: true, menu: true, hint: "Each teacher’s classes and work" },
  { href: "/admin/quick-students", label: "Students & MAP Setup", icon: "⚡", group: "school", perm: "students:manage" },
  { href: "/admin/visit", label: "Class Visit", icon: "👀", group: "school", perm: "reports:read" },
  { href: "/admin/student-cards", label: "Student Sign-in Cards", icon: "🪪", group: "school" },
  { href: "/admin/roster", label: "Import Users", icon: "📤", group: "school", nav: false, perm: "students:manage" },
  { href: "/admin/class-transfer", label: "Class Transfer", icon: "🔁", group: "school" },
  { href: "/admin/roster/clean", label: "Clear Roster", icon: "🧹", group: "school", perm: "students:manage" },
  { href: "/admin/logins", label: "Sign-Ins", icon: "🔑", group: "school", perm: "students:read" },
  { href: "/admin/messages", label: "Messages to Teachers", icon: "✉️", group: "school" },
  { href: "/teacher/levels", label: "Student Levels", icon: "🎚", group: "school", nav: false, perm: "students:read" },

  // ---- Content: questions, sorting, reading libraries, curriculum, grammar, dictionary
  { href: "/admin/questions", label: "Question Bank", icon: "📚", group: "content", home: true, menu: true, hint: "Search, preview and edit every question", perm: "questions:read" },
  { href: "/admin/skill-links", label: "Sort Questions", icon: "🧺", group: "content", home: true, menu: true, hint: "Check each question’s skill link", perm: "curriculum:edit" },
  { href: "/admin/readrise", label: "ReadRise Library", icon: "🚀", group: "content", home: true, menu: true, hint: "Articles for every reading level" },
  // ReadMaster: ONE entry → the shared ReadMaster page (the same view as students); the article editor stays one click away
  { href: "/student/readmaster", label: "ReadMaster", icon: "⭐", group: "content", menu: true },
  { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", group: "content", home: true, menu: true, hint: "Grades 4–6: units, text sets and levels", perm: "curriculum:read" },
  { href: "/admin/grammar", label: "Grammar", icon: "🔤", group: "content", home: true, menu: true, hint: "Every grade’s grammar skills" },
  { href: "/admin/dictionary", label: "Dictionary", icon: "📖", group: "content", menu: true },
  { href: "/admin/readmaster", label: "Manage ReadMaster", icon: "🛠", group: "content", perm: "questions:read" },
  { href: "/admin/questions/import", label: "Import Questions", icon: "📥", group: "content", home: true, nav: false, hint: "From the CSV or Excel template", perm: "questions:edit" },
  { href: "/admin/skills", label: "Skills", icon: "🧩", group: "content" },
  { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", group: "content" },
  { href: "/admin/questions?status=UNDER_REVIEW", label: "Questions to Approve", icon: "⏳", group: "content", nav: false, perm: "questions:publish" },
  { href: "/admin/questions/new", label: "New Question", icon: "✏️", group: "content", nav: false, perm: "questions:edit" },
  { href: "/admin/questions/requests", label: "Deletion Requests", icon: "🗑️", group: "content", nav: false, perm: "questions:publish" },
  { href: "/admin/questions/unclassified", label: "Classify Questions", icon: "🏷", group: "content", nav: false, perm: "questions:publish" },
  { href: "/admin/question-intelligence", label: "Question Insights", icon: "🧠", group: "content" },
  { href: "/admin/question-bank", label: "Bank Coverage (fill to 20)", icon: "✨", group: "content", perm: "questions:read" },
  { href: "/admin/bank-gaps", label: "Question Bank Gaps", icon: "🕳", group: "content", nav: false, perm: "questions:read" },
  { href: "/admin/question-review", label: "Tags & Review", icon: "🏷️", group: "content" },
  { href: "/admin/question-flags", label: "Flagged Questions", icon: "🚩", group: "content", perm: "questions:review" },
  { href: "/admin/item-quality", label: "Question Quality", icon: "🔬", group: "content", perm: "questions:read" },
  { href: "/admin/map-links", label: "Bank ↔ MAP", icon: "🔗", group: "content", perm: "curriculum:edit" },

  // ---- Assessments & Programs: tests, MAP, NAFS, levels and tiers, RTI
  { href: "/admin/tests", label: "Tests by Teacher", icon: "🧪", group: "programs", home: true, menu: true, hint: "Every teacher’s tests and results" },
  { href: "/teacher/map-center", label: "MAP", icon: "🗺️", group: "programs", home: true, menu: true, hint: "Scores, plans and reports" },
  { href: "/admin/nafs-links", label: "Bank ↔ NAFS", icon: "🪢", group: "programs", home: true, menu: true, hint: "NAFS standards linked to the questions", perm: "curriculum:edit" },
  { href: "/admin/levels", label: "Below / On / Above", icon: "⚖️", group: "programs", home: true, menu: true, hint: "Levels by grade, class and strand" },
  { href: "/admin/tiers", label: "Support Tiers", icon: "🪜", group: "programs", menu: true },
  { href: "/teacher/rti-plan", label: "RTI Weekly Plan", icon: "🗓", group: "programs", home: true, menu: true, hint: "RTI groups and weekly sessions" },
  { href: "/teacher/reports/games-usage", label: "Games Report", icon: "🎲", group: "programs", home: true, nav: false, hint: "Most played games, by class", perm: "reports:read" },
  { href: "/teacher/learning-loop", label: "Teach · Check · Reteach", icon: "🔄", group: "programs" },
  { href: "/teacher/map-rit", label: "MAP Scores", icon: "📥", group: "programs" },
  { href: "/teacher/map-plans", label: "MAP Plans", icon: "📋", group: "programs" },
  { href: "/teacher/map-reports", label: "MAP Reports", icon: "📑", group: "programs", nav: false, perm: "reports:read" },
  { href: "/teacher/map-test", label: "MAP Practice Test", icon: "🎯", group: "programs", nav: false, perm: "reports:read" },
  { href: "/teacher/growth", label: "MAP Growth Report", icon: "🌱", group: "programs", nav: false, perm: "reports:read" },
  { href: "/teacher/map-recommendations", label: "MAP Recommendations", icon: "💡", group: "programs", nav: false, perm: "reports:read" },
  { href: "/teacher/personal-plan", label: "Personalized Plans", icon: "📄", group: "programs", nav: false, perm: "assignments:create" },
  { href: "/admin/map-classification", label: "MAP Classification", icon: "🗃️", group: "programs" },
  { href: "/admin/map-continuum", label: "Learning Continuum", icon: "📘", group: "programs", perm: "settings:school" },
  { href: "/admin/imports", label: "MAP and Other Results", icon: "📦", group: "programs", nav: false, perm: "imports:run" },
  { href: "/admin/readrise/dashboard", label: "ReadRise Growth", icon: "📈", group: "programs" },
  { href: "/teacher/plans", label: "Skill Plans", icon: "🗂️", group: "programs", nav: false, perm: "assignments:read" },
  { href: "/teacher/data-meeting", label: "Data Meeting", icon: "🗂", group: "programs" },
  { href: "/admin/diagnostic", label: "Diagnostic Test", icon: "🩺", group: "programs" },
  { href: "/admin/assessment-calendar", label: "Assessment Calendar", icon: "🗓️", group: "programs" },
  { href: "/teacher/progress-checks", label: "Progress Checks", icon: "✅", group: "programs" },
  { href: "/teacher/knowledge-graph", label: "Skill Connections", icon: "🕸️", group: "programs" },
  { href: "/admin/learning-engine", label: "Learning Engine", icon: "⚙️", group: "programs" },

  // ---- Reports
  { href: "/admin/analytics", label: "Analytics", icon: "📐", group: "reports", home: true, menu: true, hint: "Practice and results across the school", perm: "analytics:school" },
  { href: "/admin/term-report", label: "End-of-Term Report", icon: "🧾", group: "reports", home: true, menu: true, hint: "One printable report for leadership", perm: "reports:read" },
  { href: "/admin/report-approvals", label: "Reports to Approve", icon: "📨", group: "reports", home: true, menu: true, hint: "Family reports wait for you" },
  { href: "/teacher/reports", label: "Reports", icon: "📊", group: "reports", home: true, menu: true, hint: "Every report in one place" },
  { href: "/admin/department", label: "Department Week", icon: "🏫", group: "reports", menu: true, perm: "reports:read" },
  { href: "/admin/performance", label: "Teacher & Student Performance", icon: "🏆", group: "reports", nav: false, perm: "analytics:school" },
  { href: "/admin/ai-dashboard", label: "School Insights", icon: "🏛️", group: "reports" },
  { href: "/teacher/ai", label: "Class Insights", icon: "💡", group: "reports" },
  { href: "/teacher/progress", label: "Student Progress", icon: "📉", group: "reports" },
  { href: "/teacher/grade-summary", label: "Grade Summary", icon: "🧮", group: "reports" },
  { href: "/teacher/curriculum-results", label: "Curriculum Results", icon: "📈", group: "reports", nav: false, perm: "reports:read" },
  { href: "/teacher/intervention", label: "Who Needs Help", icon: "🚨", group: "reports" },
  { href: "/teacher/alerts", label: "Alerts", icon: "🔔", group: "reports" },
  { href: "/admin/school-goals", label: "School Goals", icon: "🎯", group: "reports" },

  // ---- Settings
  { href: "/admin/settings", label: "Settings", icon: "⚙", group: "settings", home: true, menu: true, hint: "Calendar, classes, branding, engine" },
  { href: "/admin/ai-tools", label: "AI Tools", icon: "🤖", group: "settings", home: true, menu: true, hint: "AI helpers and their settings" },
  { href: "/admin/backup", label: "Backup", icon: "💾", group: "settings", home: true, menu: true, hint: "Every score and plan in one Excel file", perm: "reports:export" },
  { href: "/admin/data-health", label: "Data Health", icon: "❤️‍🩹", group: "settings", home: true, menu: true, hint: "Problems in the data, with fixes" },
  { href: "/admin/data-cleanup", label: "Data Cleanup", icon: "🧽", group: "settings", menu: true },
  { href: "/admin/feedback", label: "Feedback", icon: "💬", group: "settings", menu: true },
  { href: "/admin/connections", label: "Connections", icon: "🔌", group: "settings" },
  { href: "/admin/errors", label: "Errors", icon: "🧯", group: "settings", perm: "settings:school" },
  { href: "/teacher/search", label: "Search", icon: "🔍", group: "settings" },
  { href: "/guide", label: "Help", icon: "❔", group: "settings" },
];

/** The page with every admin tool, searchable (2 clicks from anywhere: menu → tool). */
export const ALL_TOOLS_HREF = "/admin/all";
