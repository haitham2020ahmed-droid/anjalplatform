"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { sendAdminMessage, type AudienceKind } from "@/server/messages/admin-messages";

const back = (m: string) => `/admin/messages?msg=${encodeURIComponent(m)}`;

/** Sends the message to the chosen teachers; emails go out in the background (the page does not wait). */
export async function sendMessageAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "teachers:manage" });
  const kind = String(f.get("audience") ?? "ALL") as AudienceKind;
  let to: string;
  try {
    const r = await sendAdminMessage(repo, actor, {
      subject: String(f.get("subject") ?? ""),
      body: String(f.get("body") ?? ""),
      reportKey: String(f.get("report") ?? "") || null,
      audience: { kind, grades: f.getAll("grade").map(Number), userIds: f.getAll("teacher").map(String) },
    }, { background: true });
    const mail = !r.emailOn ? "Email is off, so it is on the platform only." : `Emails are being sent to ${r.recipients - r.noEmail} teacher(s)${r.noEmail ? `; ${r.noEmail} have no email address` : ""}.`;
    to = back(`✓ Sent to ${r.recipients} teacher(s). ${mail}`);
  } catch (e) {
    if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e;
    to = back(`⚠️ ${e.message}`);
  }
  redirect(to);
}
