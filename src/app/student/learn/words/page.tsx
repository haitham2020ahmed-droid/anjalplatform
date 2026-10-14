import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";

/**
 * 📗 The Curriculum Map words moved to My Words (owner's request: one place only). Old links (assigned words in My
 * Work, bookmarks) open the same grade / unit / selection there (a preview stays a preview).
 */
export default async function OldLearnWordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await studentPage(sp.preview, () => requireActor({ roles: ["STUDENT"] }));
  const keep = new URLSearchParams();
  for (const k of ["preview", "grade", "unit", "sel"]) { const v = sp[k]; if (typeof v === "string" && v) keep.set(k, v); }
  const q = keep.toString();
  redirect(`/student/words${q ? `?${q}` : ""}`);
}
