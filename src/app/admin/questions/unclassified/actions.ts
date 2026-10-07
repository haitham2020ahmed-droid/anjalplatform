"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { classifyQuestions } from "@/server/curriculum-map/questions";

export async function classifyAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const items = [...f.keys()].filter((k) => k.startsWith("skill:")).map((k) => ({ questionId: k.slice(6), skillId: String(f.get(k) ?? "") })).filter((x) => x.skillId);
  let msg: string;
  try { msg = `${await classifyQuestions(repo, actor.schoolId!, actor.userId, items)} question(s) classified.`; }
  catch (e) { msg = (e as Error).message; }
  redirect(`/admin/questions/unclassified?msg=${encodeURIComponent(msg)}`);
}
