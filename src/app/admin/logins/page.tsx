import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { signIns } from "@/server/teacher/extras";

export const metadata = { title: "Sign-ins" };

/** 🔑 Who signs in: never or not for a while first. */
export default async function LoginsPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const role = (await searchParams).role ?? "STUDENT";
  const v = await signIns(repo, actor);
  const list = v.users.filter((u) => u.role === role);
  const never = list.filter((u) => u.days === null).length, week = list.filter((u) => u.days !== null && u.days > 7).length;
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🔑" title="Sign-ins" subtitle={`Last 7 days: ${v.logins7} sign-ins · ${v.failed7} failed attempts. Students who never signed in or not for a week are listed first.`} />
      <div className="flex flex-wrap gap-2">{(["STUDENT", "TEACHER", "PARENT", "SCHOOL_ADMIN"] as const).map((r) => <Link key={r} href={`/admin/logins?role=${r}`} className={chip(r === role)}>{r === "SCHOOL_ADMIN" ? "Admins" : `${r[0]}${r.slice(1).toLowerCase()}s`}</Link>)}</div>
      <p className="mt-3 text-slate-700"><b className="text-red-700">{never}</b> never signed in · <b className="text-amber-700">{week}</b> not in the last 7 days · {list.length} in all</p>
      <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Name</th><th>Class</th><th>Last sign-in</th><th>Days ago</th></tr></thead>
        <tbody>{list.map((u) => <tr key={u.id} className="border-b last:border-0"><td className="p-3 font-medium">{u.name}</td><td>{u.className}</td><td>{u.lastLogin ? u.lastLogin.slice(0, 16).replace("T", " ") : "never"}</td><td className={u.days === null ? "font-semibold text-red-700" : u.days > 7 ? "font-semibold text-amber-700" : ""}>{u.days ?? "—"}</td></tr>)}</tbody></table></div>
    </AppShell>
  );
}
