"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { setFinished } from "@/server/curriculum-map/respond-assign";

/** ✅ “I finished my answer in my book” (or undo). */
export async function finishedAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const id = String(f.get("assignmentId") ?? ""), code = String(f.get("code") ?? "");
  const done = f.get("done") === "1";
  await setFinished(repo, actor, id, done);
  redirect(`/student/respond/${code}?${new URLSearchParams({ msg: done ? "🎉 Great job! Your teacher can see that you finished." : "OK — it is marked as not finished." })}`);
}
