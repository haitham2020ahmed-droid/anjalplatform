"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { dismissNotice, STARS_NOTICE } from "@/server/skills/notices";
import { setSkillGoal } from "@/server/skills/status-extras";
import { ValidationError } from "@/server/curriculum-admin";

/** "New: skill stars" — Got it (once per user). */
export async function dismissStarsNoticeAction(): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  await dismissNotice(repo, actor.userId, STARS_NOTICE);
  revalidatePath("/teacher");
}

/** 🎯 The teacher sets a student's weekly goal (master N skills) from the Skills grid. */
export async function setStudentSkillGoalAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  try { await setSkillGoal(repo, actor, { studentId: String(f.get("studentId") ?? ""), target: Number(f.get("target")) }); } catch (e) { if (!(e instanceof ValidationError)) throw e; }
  revalidatePath("/teacher/reports/skills-grid");
}
