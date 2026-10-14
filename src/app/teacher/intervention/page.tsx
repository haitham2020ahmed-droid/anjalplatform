import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";

export const metadata = { title: "Student alerts" };

/**
 * 🚨 "Who Needs Help" merged into ONE follow-up page (owner r67: nothing twice): Alerts → MAP and practice flags
 * (/teacher/alerts?view=flags), with the same flags, Assign review and the action buttons. Old links (?flag=) open it.
 */
export default async function InterventionPage({ searchParams }: { searchParams: Promise<{ flag?: string; msg?: string }> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const sp = await searchParams;
  redirect(`/teacher/alerts?${new URLSearchParams({ view: "flags", ...(sp.flag ? { flag: sp.flag } : {}), ...(sp.msg ? { msg: sp.msg } : {}) })}`);
}
