"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { markAllRead, openNotification } from "@/server/notifications";

export async function openNotificationAction(f: FormData): Promise<void> {
  const actor = await requireActor({});
  redirect(await openNotification(repo, actor, String(f.get("id") ?? "")));
}

export async function markAllReadAction(): Promise<void> {
  const actor = await requireActor({});
  await markAllRead(repo, actor);
  redirect("/notifications");
}
