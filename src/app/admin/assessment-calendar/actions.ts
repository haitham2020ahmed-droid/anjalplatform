"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { resetCycle, saveCycle } from "@/server/assessment-cycle/cycle";

const v = (f: FormData, k: string) => String(f.get(k) ?? "").trim().slice(0, 40);

/** 🗓️ The school admin saves the assessment calendar (validated; stored in the school settings). */
export async function saveCycleAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  const rows = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ name: v(f, `${prefix}${i}name`), opens: v(f, `${prefix}${i}opens`), closes: v(f, `${prefix}${i}closes`) })).filter((x) => x.opens || x.closes);
  const raw = {
    year: v(f, "year"), yearStart: v(f, "yearStart"), yearEnd: v(f, "yearEnd"),
    diagnostic: Object.fromEntries(["BOY", "MOY", "EOY"].map((p) => [p, { opens: v(f, `${p}opens`), closes: v(f, `${p}closes`) }])),
    map: rows("map", 4), breaks: rows("brk", 6),
    weeklyCheck: f.get("weeklyCheck") === "1",
    progressChecks: { enabled: f.get("pcEnabled") === "1", weeksPerUnit: Number(v(f, "weeksPerUnit")), graceDays: Number(v(f, "graceDays")) },
    fluency: { tier2Days: Number(v(f, "tier2Days")), tier3Days: Number(v(f, "tier3Days")) },
  };
  let msg = "✓ Assessment calendar saved.";
  try { await saveCycle(repo, actor, raw); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  redirect(`/admin/assessment-calendar?msg=${encodeURIComponent(msg)}`);
}

/** Back to the default school-year plan. */
export async function resetCycleAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  let msg = "✓ Back to the default plan.";
  try { await resetCycle(repo, actor); }
  catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  redirect(`/admin/assessment-calendar?msg=${encodeURIComponent(msg)}`);
}
