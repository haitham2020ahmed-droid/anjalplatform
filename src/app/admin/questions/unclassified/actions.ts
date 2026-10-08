"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { autoClassify, classifyQuestions } from "@/server/curriculum-map/questions";

export async function classifyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const items = [...f.keys()].filter((k) => k.startsWith("skill:")).map((k) => ({ questionId: k.slice(6), skillId: String(f.get(k) ?? "") })).filter((x) => x.skillId);
  let msg: string;
  try { msg = `${await classifyQuestions(repo, actor.schoolId!, actor.userId, items)} question(s) classified.`; }
  catch (e) { msg = (e as Error).message; }
  redirect(`/admin/questions/unclassified?msg=${encodeURIComponent(msg)}`);
}

/** 🪄 Every question that has a standard goes to the grade's skill linked to that standard. */
export async function autoClassifyAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const r = await autoClassify(repo, actor.schoolId!, actor.userId);
  redirect(`/admin/questions/unclassified?msg=${encodeURIComponent(`🪄 ${r.classified} question(s) classified by their standard. ${r.left} left (no standard, or no skill linked to it): choose them below, or leave them — they work on the Curriculum Map either way.`)}`);
}
