import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, requireActor } from "@/server/auth/next";
import { ROSTER_COLUMNS } from "@/server/admin/roster-import";
import { RosterForm } from "./roster-form";

export default async function RosterPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  return (
    <AppShell name={String(me.displayName)}>
      <p className="mb-4 text-end"><a href="/admin/roster/clean" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🧹 Clean roster (archive / delete students first)</a></p>
      <p><Link href="/admin" className="text-brand-teal hover:underline">← Administration</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy">Import Users</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Add or update students, teachers, parents and admins from a CSV or Excel file. Every row is checked first; nothing is saved until you import,
        and then all rows are saved together or none are. Existing usernames are updated (name, email, class) and keep their passwords; archived students (Clean roster) come back with a new temporary password.
      </p>
      <p className="mt-2 text-sm text-slate-500">Columns: {ROSTER_COLUMNS.join(", ")}. Separate several classes or children with “;”.</p>
      <div className="mt-6"><RosterForm /></div>
    </AppShell>
  );
}
