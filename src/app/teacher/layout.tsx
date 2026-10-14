import { SectionFrame } from "@/components/app-shell";

/** ⚡ The page frame (menu, top bar) is drawn here once and kept while moving between teacher pages (see AppShell). */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <SectionFrame>{children}</SectionFrame>;
}
