import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { RESPOND_LEVEL_NAME, studentRespondList } from "@/server/curriculum-map/respond";

export const metadata = { title: "Respond to Reading" };

/** ✍️ Respond to Reading for students: the Text Sets of my grade; each opens at my level. */
export default async function StudentRespondList() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const v = await studentRespondList(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="✍️" title="Respond to Reading" subtitle={`Write about what you read. Your activities are at ${RESPOND_LEVEL_NAME[v.level]}.`} />
      {v.units.length === 0 ? <p className="mt-6 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No activities yet.</p> : v.units.map((u) => (
        <section key={u.unit} className="mt-5">
          <h2 className="text-xl font-bold text-brand-navy">{u.unit}</h2>
          <ul className="mt-2 grid gap-3 md:grid-cols-2">
            {u.sets.map((x) => (
              <li key={x.setCode}><Link href={`/student/respond/${x.setCode}`} className="lift block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-lg font-bold text-brand-navy">✍️ {x.heading}</p>{x.sharedRead && <p className="text-sm text-slate-600">📖 {x.sharedRead}</p>}
              </Link></li>
            ))}
          </ul>
        </section>
      ))}
    </AppShell>
  );
}
