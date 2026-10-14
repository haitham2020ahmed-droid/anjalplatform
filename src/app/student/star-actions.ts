"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { saveSelfCheck, setSkillGoal, skipLearnSuggestion } from "@/server/skills/status-extras";

const back = (f: FormData, fallback: string) => { const b = String(f.get("back") ?? ""); return b.startsWith("/") && !b.startsWith("//") ? b : fallback; };

/** 🎯 This week's goal: master N skills (the student's own). */
export async function setMySkillGoalAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { await setSkillGoal(repo, actor, { target: Number(f.get("target")) }); } catch (e) { if (!(e instanceof ValidationError)) throw e; }
  redirect(back(f, "/student/work"));
}

/** 😊😐😟 "Do you feel you understood it?" */
export async function selfCheckAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  try { await saveSelfCheck(repo, actor, String(f.get("key") ?? ""), String(f.get("value") ?? "")); } catch (e) { if (!(e instanceof ValidationError)) throw e; }
  redirect(back(f, "/student/work"));
}

/** "Keep practising": the Learn suggestion is not shown again for a week; practice opens. */
export async function skipLearnAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const skillId = String(f.get("skillId") ?? "");
  if (skillId) await skipLearnSuggestion(repo, actor.studentId!, skillId);
  redirect(`/practice/${encodeURIComponent(skillId)}${f.get("from") ? `?from=${encodeURIComponent(String(f.get("from")))}` : ""}`);
}
