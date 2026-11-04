"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { setInterests } from "@/server/readrise/interests";

export type InterestsResult = { ok: true } | { ok: false; error: string };

/** ❤️ A student saves the (up to 3) ReadRise topics they like — form field "topic", repeated. */
export async function setInterestsAction(formData: FormData): Promise<InterestsResult> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const topics = formData.getAll("topic").map((v) => String(v)).filter(Boolean);
  try {
    await setInterests(repo, actor, topics);
    revalidatePath("/student/readrise");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
