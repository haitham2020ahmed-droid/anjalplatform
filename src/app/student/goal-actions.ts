"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { setStudentGoal, type GoalKind } from "@/server/teacher/classroom";

/** 🎯 The student sets this week's own goal. */
export async function setMyGoalAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  let msg = "🎯 Goal set. You can do it!";
  try { await setStudentGoal(repo, actor, (f.get("kind") === "MINUTES" ? "MINUTES" : "ANSWERS") as GoalKind, Number(f.get("target"))); } catch (e) { if (e instanceof ValidationError) msg = e.message; else throw e; }
  redirect(`/student?goal=${encodeURIComponent(msg)}#my-week`);
}
