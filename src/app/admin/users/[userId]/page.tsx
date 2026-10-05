import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActionForm } from "@/components/admin/action-form";
import { card, field, h2, label } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { listUsers, manageableUser } from "@/server/admin/users";
import { ResetPasswordButton } from "@/app/teacher/students/[studentId]/reset-password-button";
import { linkParentAction, moveStudentAction, setActiveAction, teacherClassesAction, unlinkParentAction, updateUserAction } from "../../actions";

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { userId } = await params;
  const u = await manageableUser(repo, actor, userId).catch(() => null);
  if (!u) notFound();
  const all = await listUsers(repo, actor, { includeInactive: true });
  const item = all.find((x) => x.userId === userId)!;
  const schoolId = actor.schoolId!;
  const gradeOf = new Map((await repo.findMany("Grade", { schoolId })).map((g) => [String(g.id), Number(g.level)]));
  const classes = (await repo.findMany("Class", { schoolId, deletedAt: null })).map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf.get(String(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const teacher = u.role === "TEACHER" ? await repo.findUnique("Teacher", { userId }) : null;
  const taught = teacher ? new Set((await repo.findMany("ClassTeacher", { teacherId: teacher.id })).map((c) => String(c.classId))) : new Set<string>();
  const student = u.role === "STUDENT" ? await repo.findUnique("Student", { userId }) : null;
  const currentClass = student ? (await repo.findMany("ClassMembership", { studentId: student.id, leftAt: null }))[0]?.classId : null;
  const parent = u.role === "PARENT" ? await repo.findUnique("Parent", { userId }) : null;
  const links = parent ? await repo.findMany("ParentStudent", { parentId: parent.id }) : [];
  const linkedStudents = links.length ? await repo.findMany("Student", { id: { in: links.map((l) => l.studentId) } }) : [];
  const studentsList = all.filter((x) => x.role === "STUDENT" && x.isActive);
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/admin/users" className="text-brand-teal hover:underline">← Users</Link></p>
      <h1 className="mt-2 text-3xl font-bold text-brand-navy"><bdi>{item.displayName}</bdi></h1>
      <p className="mt-1 text-slate-600">{item.role.replace("_", " ").toLowerCase()} · <span className="font-mono">{item.username}</span>{item.studentNumber ? ` · student number ${item.studentNumber}` : ""}{item.isActive ? "" : " · deactivated"}</p>

      <section className={card}>
        <h2 className={h2}>Details</h2>
        <ActionForm action={updateUserAction} submit="Save details" className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="userId" value={userId} />
          <label className={label}>Full name<input name="displayName" defaultValue={item.displayName} required maxLength={100} dir="auto" className={field} /></label>
          <label className={label}>Email<input name="email" type="email" defaultValue={String(u.email ?? "")} maxLength={254} className={field} /></label>
          {teacher && <label className={label}>Title<input name="title" defaultValue={String(teacher.title ?? "")} maxLength={20} className={field} /></label>}
          <div className="sm:col-span-2" />
        </ActionForm>
        <div className="mt-4 flex flex-wrap gap-3">
          <ResetPasswordButton userId={userId} />
          {userId !== actor.userId && (
            <form action={setActiveAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="active" value={item.isActive ? "false" : "true"} />
              <button className={`rounded-xl px-4 py-2 font-semibold ${item.isActive ? "text-red-700 ring-1 ring-red-200 hover:bg-red-50" : "text-brand-teal ring-1 ring-slate-300"}`}>
                {item.isActive ? "Deactivate (signs out everywhere)" : "Reactivate"}
              </button>
            </form>
          )}
        </div>
      </section>

      {teacher && can(actor, "classes:manage") && (
        <section className={card}>
          <h2 className={h2}>Classes taught</h2>
          <ActionForm action={teacherClassesAction} submit="Save classes" className="mt-3 space-y-3">
            <input type="hidden" name="userId" value={userId} />
            <div className="flex flex-wrap gap-4">
              {classes.map((c) => <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="classId" value={c.id} defaultChecked={taught.has(c.id)} />{c.name} <span className="text-xs text-slate-500">(G{c.grade})</span></label>)}
            </div>
          </ActionForm>
        </section>
      )}

      {student && can(actor, "classes:manage") && (
        <section className={card}>
          <h2 className={h2}>Class</h2>
          <p className="text-sm text-slate-600">Moving keeps the student&apos;s history. Choosing a class in another grade also moves the student to that grade.</p>
          <ActionForm action={moveStudentAction} submit="Move" className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="userId" value={userId} />
            <label className={label}>Class<select name="classId" defaultValue={currentClass ? String(currentClass) : ""} className={field}><option value="">No class</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name} (Grade {c.grade})</option>)}</select></label>
          </ActionForm>
        </section>
      )}

      {parent && (
        <section className={card}>
          <h2 className={h2}>Children</h2>
          <ul className="mt-2 space-y-2">
            {linkedStudents.map((s) => {
              const su = all.find((x) => x.studentNumber === String(s.studentNumber));
              return su ? (
                <li key={String(s.id)} className="flex items-center gap-3">
                  <bdi>{su.displayName}</bdi> <span className="text-sm text-slate-500">({su.studentNumber})</span>
                  <form action={unlinkParentAction}><input type="hidden" name="parentUserId" value={userId} /><input type="hidden" name="studentUserId" value={su.userId} /><button className="text-sm text-red-700 hover:underline">Remove link</button></form>
                </li>
              ) : null;
            })}
            {linkedStudents.length === 0 && <li className="text-slate-500">No children linked yet.</li>}
          </ul>
          <ActionForm action={linkParentAction} submit="Link child" className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="parentUserId" value={userId} />
            <label className={label}>Student<select name="studentUserId" required className={field}>{studentsList.map((s) => <option key={s.userId} value={s.userId}>{s.displayName} ({s.studentNumber})</option>)}</select></label>
            <label className={label}>Relationship<input name="relationship" placeholder="mother, father, guardian" maxLength={30} className={field} /></label>
          </ActionForm>
        </section>
      )}
    </AppShell>
  );
}
