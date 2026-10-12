import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BigTile } from "@/components/ui-kit";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "ReadMaster / ReadRise" };

/** 📚 Reading in one place (teacher menu): ReadMaster, ReadRise and the reading tools. All content is open to every teacher. */
export default async function TeacherReading() {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📚" title="ReadMaster / ReadRise" subtitle="Articles for every grade and reading level, and the reading tools." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BigTile href="/student/readmaster" icon="⭐" label="ReadMaster" hint="One article, three reading levels" />
        <BigTile href="/teacher/readrise" icon="🚀" label="ReadRise" hint="Articles and each student's reading level" />
        <BigTile href="/teacher/fluency" icon="🔊" label="Reading Fluency" hint="Fluency Coach results" />
        <BigTile href="/teacher/respond" icon="✍️" label="Respond to Reading" hint="Writing tasks at three levels" />
        <BigTile href="/teacher/writing" icon="🖊" label="Writing & Reading Aloud" hint="Student writing to review" />
        <BigTile href="/teacher/word-journal" icon="📒" label="Word Journals" hint="Students' word journals" />
      </div>
    </AppShell>
  );
}
