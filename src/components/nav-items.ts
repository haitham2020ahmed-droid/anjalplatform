import type { NavItem } from "./ui/main-nav";

/** Each role's main sections, in the order of the work: plan → teach → track. */
export function navItemsFor(role: string): NavItem[] {
  if (role === "TEACHER") return [
    { href: "/teacher", label: "Home", icon: "🏠" },
    { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭" },
    { href: "/admin/questions", label: "Question Bank", icon: "📚" },
    { href: "/admin/readmaster", label: "ReadMaster", icon: "⭐" },
    { href: "/teacher/assignments", label: "Assignments", icon: "📝" },
    { href: "/teacher/map-rit", label: "MAP", icon: "🗺️" },
    { href: "/teacher/personal-plan", label: "Plans", icon: "📋" },
    { href: "/teacher/intervention", label: "Intervention", icon: "🚨" },
    { href: "/teacher/levels", label: "Levels", icon: "🎯" },
    { href: "/teacher/games", label: "Games", icon: "🎮" },
  ];
  if (role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN") return [
    { href: "/admin", label: "Home", icon: "🏠" },
    { href: "/admin/curriculum-map", label: "Curriculum Map", icon: "🧭" },
    { href: "/admin/questions", label: "Question Bank", icon: "📚" },
    { href: "/admin/readmaster", label: "ReadMaster", icon: "⭐" },
    { href: "/teacher/map-rit", label: "MAP", icon: "🗺️" },
    { href: "/teacher/intervention", label: "Intervention", icon: "🚨" },
    { href: "/admin/analytics", label: "Analytics", icon: "📊" },
    { href: "/admin/users", label: "Users", icon: "👥" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  ];
  if (role === "STUDENT") return [
    { href: "/student", label: "Home", icon: "🏠" },
    { href: "/student/readmaster", label: "ReadMaster", icon: "⭐" },
    { href: "/student/map", label: "My MAP", icon: "🗺️" },
    { href: "/student/plans", label: "My plans", icon: "🗂️" },
    { href: "/play", label: "Join a game", icon: "🎮" },
  ];
  return [];
}
