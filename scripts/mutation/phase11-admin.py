import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("self-approval allowed", "src/server/admin/questions.ts", 'if (q.createdById === actor.userId && !isAdmin(actor)) throw new ForbiddenError("Another reviewer', 'if (false) throw new ForbiddenError("Another reviewer'),
 ("teacher may edit others' drafts", "src/server/admin/questions.ts", 'if (q.createdById !== actor.userId && !can(actor, "questions:publish") && !isAdmin(actor)) throw', 'if (false) throw'),
 ("published items editable", "src/server/admin/questions.ts", 'if (q.status === "PUBLISHED" || q.status === "ARCHIVED") throw', 'if (false) throw'),
 ("revision does not archive original", "src/server/admin/questions.ts", 'if (revisionOf) await tx.updateMany("Question", { id: revisionOf, status: "PUBLISHED" }, { status: "ARCHIVED", updatedAt: now });', ''),
 ("reject without note", "src/server/admin/questions.ts", 'if (!n) throw new ValidationError("Say what needs to change', 'if (false) throw new ValidationError("Say what needs to change'),
 ("deactivation keeps sessions", "src/server/admin/users.ts", 'if (patch.isActive === false && u.isActive) await revokeAllSessions(repo, userId);', ''),
 ("self-deactivation allowed", "src/server/admin/users.ts", 'if (!patch.isActive && userId === actor.userId) throw', 'if (false) throw'),
 ("super admin manageable", "src/server/admin/users.ts", 'u.role === "SUPER_ADMIN" || u.schoolId', 'u.schoolId'),
 ("bidi characters kept", "src/server/admin/users.ts", '.replace(CONTROL, "")', ''),
 ("class move deletes history", "src/server/admin/users.ts", 'for (const m of open) await tx.updateMany("ClassMembership", { classId: m.classId, studentId: st.id }, { leftAt: now });', 'for (const m of open) await tx.deleteMany("ClassMembership", { classId: m.classId, studentId: st.id });'),
 ("engine ranges unchecked", "src/server/admin/settings.ts", 'if (!Number.isFinite(n) || n < lim.min || n > lim.max', 'if (!Number.isFinite(n)'),
 ("overlapping terms allowed", "src/server/admin/settings.ts", 'if (i > 0 && t.start <= terms[i - 1].end) throw', 'if (false) throw'),
 ("logo not validated", "src/server/admin/settings.ts", '  if (!v.ok) throw new ValidationError(v.reason);', '  if (!v.ok) return "x";'),
 ("roster hash not checked", "src/server/admin/roster-import.ts", 'if (plan.sha256 !== expectedSha256) throw', 'if (false) throw'),
 ("roster applies with problems", "src/server/admin/roster-import.ts", 'if (plan.problems.length) throw', 'if (false) throw'),
 ("roster: wrong-grade class accepted", "src/server/admin/roster-import.ts", 'if (role === "STUDENT" && grade && gradeLevel(found.gradeId) !== grade) bad(', 'if (false) bad('),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:50])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", "tests/admin.test.ts"], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name)
