import type { NavItem } from "./ui/main-nav";

/**
 * Each role's main sections. Staff menus are grouped (Teach · Students · MAP · …) so the bar stays short;
 * the most used pages stay one click away.
 */
export function navItemsFor(role: string): NavItem[] {
  if (role === "TEACHER") return [
    { href: "/teacher", label: "Home", icon: "🏠" },
    { href: "/teacher/classes", label: "My Classes", icon: "👥" },
    { href: "/teacher/week", label: "My week", icon: "📅" },
    { href: "/admin/curriculum-map", label: "Curriculum", icon: "🧭", group: "Teach" },
    { href: "/teacher/assignments", label: "Assignments", icon: "📝", group: "Teach" },
    { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", group: "Teach" },
    { href: "/teacher/writing", label: "Writing & reading aloud", icon: "✍️", group: "Teach" },
    { href: "/admin/grammar", label: "Grammar", icon: "🔤", group: "Teach" },
    { href: "/teacher/respond", label: "Respond", icon: "✍️", group: "Teach" },
    { href: "/teacher/games", label: "Games", icon: "🎮", group: "Teach" },
    { href: "/admin/dictionary", label: "Dictionary", icon: "📖", group: "Teach" },
    { href: "/teacher/progress", label: "Students", icon: "📈", group: "Students" },
    { href: "/admin/student-file", label: "Find a student", icon: "🔎", group: "Students" },
    { href: "/teacher/alerts", label: "Alerts", icon: "🚨", group: "Students" },
    { href: "/teacher/levels", label: "Levels", icon: "🎯", group: "Students" },
    { href: "/teacher/reports", label: "Reports", icon: "📄", group: "Students" },
    { href: "/teacher/calendar", label: "Calendar", icon: "🗓️", group: "Students" },
    { href: "/teacher/map-rit", label: "MAP Data", icon: "🗺️", group: "MAP" },
    { href: "/teacher/map-plans", label: "MAP plans", icon: "📋", group: "MAP" },
    { href: "/teacher/map-test", label: "MAP practice test", icon: "🧭", group: "MAP" },
    { href: "/teacher/growth", label: "MAP growth", icon: "📈", group: "MAP" },
    { href: "/guide", label: "Guide", icon: "❔" },
  ];
  if (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN") return [
    { href: "/admin", label: "Home", icon: "🏠" },
    { href: "/admin/department", label: "Department week", icon: "🏫" },
    { href: "/teacher/alerts", label: "Alerts", icon: "🚨" },
    { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭", group: "Content" },
    { href: "/admin/questions", label: "Question Bank", icon: "📚", group: "Content" },
    { href: "/admin/skills", label: "Skills", icon: "🧩", group: "Content" },
    { href: "/admin/ai-tools", label: "AI tools", icon: "🤖", group: "Content" },
    { href: "/admin/question-review", label: "Tags & review", icon: "🏷️", group: "Content" },
    { href: "/admin/question-flags", label: "Flagged questions", icon: "🚩", group: "Content" },
    { href: "/admin/dictionary", label: "Dictionary", icon: "📖", group: "Content" },
    { href: "/admin/readmaster", label: "ReadMaster", icon: "⭐", group: "Content" },
    { href: "/admin/grammar", label: "Grammar", icon: "🔤", group: "Content" },
    { href: "/teacher/worksheet", label: "Worksheets", icon: "🖨", group: "Content" },
    { href: "/admin/student-file", label: "Find a student", icon: "🔎", group: "Follow-up" },
    { href: "/teacher/progress", label: "Students", icon: "📈", group: "Follow-up" },
    { href: "/teacher/grade-summary", label: "Grade summary", icon: "📊", group: "Follow-up" },
    { href: "/admin/teachers", label: "Teacher follow-up", icon: "🧑‍🏫", group: "Follow-up" },
    { href: "/admin/visit", label: "Class visit", icon: "👀", group: "Follow-up" },
    { href: "/admin/term-report", label: "End-of-term report", icon: "🧾", group: "Follow-up" },
    { href: "/admin/analytics", label: "Analytics", icon: "📉", group: "Follow-up" },
    { href: "/teacher/map-rit", label: "MAP data", icon: "🗺️", group: "MAP" },
    { href: "/teacher/map-plans", label: "MAP plans", icon: "📋", group: "MAP" },
    { href: "/teacher/map-test", label: "MAP practice test", icon: "🧭", group: "MAP" },
    { href: "/teacher/growth", label: "MAP growth", icon: "📈", group: "MAP" },
    { href: "/admin/map-links", label: "Bank ↔ MAP", icon: "🔗", group: "MAP" },
    { href: "/admin/users", label: "Users", icon: "👥", group: "School" },
    { href: "/admin/logins", label: "Sign-ins", icon: "🔑", group: "School" },
    { href: "/admin/backup", label: "Backup", icon: "💾", group: "School" },
    { href: "/admin/errors", label: "Errors", icon: "🩺", group: "School" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️", group: "School" },
  ];
  if (role === "STUDENT") return [
    { href: "/student", label: "My work", icon: "📘" },
    { href: "/student/map", label: "My MAP", icon: "🗺️" },
    { href: "/student/skills", label: "My skills", icon: "🧩" },
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐" },
    { href: "/student/respond", label: "Respond", icon: "✍️" },
    { href: "/student/writing", label: "Writing", icon: "🖊" },
    { href: "/student/words", label: "My words", icon: "📒" },
    { href: "/student/review", label: "Review", icon: "🔁" },
    { href: "/student/badges", label: "Badges", icon: "🏅" },
    { href: "/student/plans", label: "My plans", icon: "🗂️" },
    { href: "/play", label: "Join a game", icon: "🎮" },
    { href: "/guide", label: "Help", icon: "❔" },
  ];
  return [];
}
