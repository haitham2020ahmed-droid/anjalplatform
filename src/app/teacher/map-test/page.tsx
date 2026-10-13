import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { mapCenterHref, mapTestHref } from "../map-center/href";

export const metadata = { title: "MAP Test" };

/** The MAP practice test is merged into MAP → MAP Test (one place only): old links open the tab, or the test itself. */
export default async function MapTestRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const sp = await searchParams;
  const w = Array.isArray(sp.w) ? sp.w[0] : sp.w;
  const one = (k: string) => String((Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "");
  redirect(w ? mapTestHref(w, { subject: one("subject"), msg: one("msg") }) : mapCenterHref("test", sp));
}
