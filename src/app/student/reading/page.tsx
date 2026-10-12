import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { BigTile } from "@/components/ui-kit";
import { getActor, requireActor } from "@/server/auth/next";
import { FluencyCoachIcon } from "@/components/fluency/coach-icon";
import { ReadRiseIcon } from "@/components/readrise/readrise-icon";

export const metadata = { title: "ReadMaster / ReadRise" };

/** 📚 Reading in one place (student menu): ReadMaster, ReadRise, Fluency Coach and the writing about reading. */
export default async function StudentReading() {
  await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📚" title="ReadMaster / ReadRise" subtitle="Read, listen and practise reading." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BigTile href="/student/readmaster" icon="⭐" label="ReadMaster" hint="All the articles for your grade" tone="sun" />
        <BigTile href="/student/readrise" icon={<ReadRiseIcon size={40} />} label="ReadRise" hint="Articles on every topic" tone="violet" />
        <BigTile href="/student/fluency-coach" icon={<FluencyCoachIcon size={40} />} label="Fluency Coach" hint="Read aloud and get feedback" tone="rose" />
        <BigTile href="/student/respond" icon="✍️" label="Respond to Reading" hint="Write about what you read" tone="sky" />
        <BigTile href="/student/words" icon="📒" label="My Words" hint="The words you collected" tone="violet" />
      </div>
    </AppShell>
  );
}
