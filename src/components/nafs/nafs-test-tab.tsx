import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { subOf } from "@/server/nafs/center";
import { TestsTab } from "./tests-tab";
import { ReportsTab } from "./reports-tab";
import { SubNav } from "./sub-nav";

/**
 * 🇸🇦 NAFS center → 2. NAFS TEST: "Create" (the ONE builder's starts and the school's NAFS tests) and "Report" (one test
 * and all tests: score, per standard, item analysis, distractors, students' results, progress, export). The NAFS test
 * report lives HERE only.
 */
export async function NafsTestTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const sub = subOf("test", sp.sub);
  return (
    <>
      <SubNav tab="test" sub={sub} t={t} />
      {sub === "report" ? <ReportsTab actor={actor} t={t} sp={sp} /> : <TestsTab actor={actor} t={t} />}
    </>
  );
}
