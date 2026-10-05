import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card, field, h2, label } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listUsers, MANAGED_ROLES, type ManagedRole } from "@/server/admin/users";
import { CreateUserForm } from "./create-user-form";

const ROLE_LABEL: Record<ManagedRole, string> = { SCHOOL_ADMIN: "School admin", TEACHER: "Teacher", STUDENT: "Student", PARENT: "Parent" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string; inactive?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const q = await searchParams;
  const role = (MANAGED_ROLES as readonly string[]).includes(q.role ?? "") ? (q.role as ManagedRole) : undefined;
  const users = await listUsers(repo, actor, { role, q: q.q?.slice(0, 100), includeInactive: q.inactive === "1" });
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId! })).map((g) => Number(g.level)).sort((a, b) => a - b);
  const gradeOf = new Map((await repo.findMany("Grade", { schoolId: actor.schoolId! })).map((g) => [String(g.id), Number(g.level)]));
  const classes = (await repo.findMany("Class", { schoolId: actor.schoolId!, deletedAt: null })).map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf.get(String(c.gradeId)) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin" className="text-brand-teal hover:underline">← Administration</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Users</h1>
      <p className="mt-1 text-slate-600">To add many users at once, use <Link href="/admin/roster" className="text-brand-teal hover:underline">Import users</Link>.</p>

      <section className={card} aria-labelledby="new-user">
        <h2 id="new-user" className={h2}>New account</h2>
        <div className="mt-3"><CreateUserForm grades={grades} classes={classes} /></div>
      </section>

      <section className={card} aria-labelledby="all-users">
        <h2 id="all-users" className={h2}>All accounts</h2>
        <form className="mt-3 flex flex-wrap items-end gap-3" method="get">
          <label className={label}>Role<select name="role" defaultValue={role ?? ""} className={field}><option value="">All</option>{MANAGED_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
          <label className={label}>Search<input name="q" defaultValue={q.q ?? ""} placeholder="Name, username or number" className={field} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="inactive" value="1" defaultChecked={q.inactive === "1"} />Show deactivated</label>
          <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Filter</button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Name</th><th>Username</th><th>Role</th><th>Class / classes / children</th><th>Last sign-in</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} className="border-b last:border-0">
                  <td className="py-2"><Link href={`/admin/users/${u.userId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{u.displayName}</bdi></Link></td>
                  <td className="font-mono text-xs">{u.username}</td>
                  <td>{ROLE_LABEL[u.role]}{u.studentNumber ? ` · ${u.studentNumber}` : ""}</td>
                  <td>{u.role === "STUDENT" ? u.className ?? "—" : u.role === "TEACHER" ? u.classes.join(", ") || "—" : u.role === "PARENT" ? <bdi>{u.children.join(", ") || "—"}</bdi> : "—"}</td>
                  <td>{u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : u.mustChangePassword ? "Not yet" : "—"}</td>
                  <td>{u.isActive ? <span className="text-brand-teal">Active</span> : <span className="text-red-700">Deactivated</span>}</td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
