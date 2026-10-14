import { AppShell } from "@/components/app-shell";
import { ReportHeader } from "@/components/report-kit";
import { StarLegend } from "@/components/skills/skill-star";
import { MySkillsView } from "@/components/skills/my-skills-view";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { mySkills, MY_SKILLS_TABS, syncNafsPracticeStars, type MySkills, type MySkillsTab } from "@/server/skills/my-skills";
import { runAfterResponse } from "@/server/lib/after-response";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";

export const metadata = { title: "My Skills" };

/**
 * ⭐ My Skills (owner r68): every skill of mine with its ONE star, in four tabs — Mastered · Learning · Review · Not
 * started (only the skills of my own plans) — grouped by strand, one button each. Default: Learning, else Mastered.
 * Data: src/server/skills/my-skills.ts. NAFS practice answers bring their stars up to date after the page is sent.
 */
export default async function MySkillsPage({ searchParams }: { searchParams: Promise<{ tab?: string; preview?: string }> }) {
  const sp = await searchParams;
  const { actor, me, preview } = await studentPage(sp.preview, () => requireActor({ roles: ["STUDENT"] }));
  const sid = actor.studentId!;
  const [{ t }, v] = await Promise.all([getT(), safeIfBehind("student.my-skills", () => mySkills(repo, sid), null as MySkills | null)]);
  if (!preview) runAfterResponse("skills.nafs_sync", () => syncNafsPracticeStars(repo, sid), { key: `skills.nafs_sync|${sid}` });
  const tab: MySkillsTab = v && (MY_SKILLS_TABS as readonly string[]).includes(String(sp.tab)) && v.tabs.includes(sp.tab as MySkillsTab) ? (sp.tab as MySkillsTab) : v?.tab ?? "LEARNING";
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <ReportHeader back={{ href: "/student/work", label: "My Work" }} icon="⭐" title="My Skills" subtitle={t("Every skill you practise, with its star.")} who={String(me.displayName)} />
      <StarLegend who="student" t={t} className="mb-3" />
      {v ? <MySkillsView v={v} tab={tab} t={t} hrefOf={(k) => `/student/skills?tab=${k}`} />
        : <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">{t("Your skills will appear here soon.")}</p>}
    </PreviewFrame></AppShell>
  );
}
