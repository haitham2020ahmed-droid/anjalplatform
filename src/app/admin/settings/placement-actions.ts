"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { setPlacementRequired } from "@/server/student/assigned";
import type { Result } from "../actions";

export async function placementAction(_: Result, f: FormData): Promise<Result> {
  const actor = await requireActor({ permission: "settings:school" });
  const required = f.get("required") === "1";
  await setPlacementRequired(repo, actor, required);
  revalidatePath("/admin/settings");
  return { message: required ? "Students who have not taken the placement test will be asked to take it." : "The placement test is now hidden from students." };
}
