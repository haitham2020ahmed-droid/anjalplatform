import subprocess, shutil, os, tempfile
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("admin student access ignores school", "src/server/auth/rbac.ts", 'return actor.schoolId !== null && actor.schoolId === target.schoolId;', 'return actor.schoolId !== null;'),
 ("user management ignores school", "src/server/admin/users.ts", 'u.role === "SUPER_ADMIN" || u.schoolId !== schoolOf(actor)', 'u.role === "SUPER_ADMIN"'),
 ("question scope ignores school", "src/server/admin/questions.ts", 'if (!skill || !grade || grade.schoolId !== schoolOf(actor))', 'if (!skill || !grade)'),
 ("class rename ignores school", "src/server/admin/settings.ts", 'if (!c || c.deletedAt || c.schoolId !== schoolOf(actor)) throw new ForbiddenError("Class not found.");\n  const name = String(newName', 'if (!c || c.deletedAt) throw new ForbiddenError("Class not found.");\n  const name = String(newName'),
 ("class picker ignores school", "src/server/admin/users.ts", 'if (!c || c.deletedAt || c.schoolId !== schoolOf(actor)) throw new ValidationError("Class not found in this school.");', 'if (!c || c.deletedAt) throw new ValidationError("Class not found in this school.");'),
]
for name, f, a, b in muts:
    src = open(f).read(); assert a in src, (name, a[:50])
    shutil.copy(f, BAK); open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", "tests/isolation.test.ts"], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    allowed = sorted(set(l.split("ALLOWED")[1].split(":")[0].strip() for l in r.stdout.splitlines() if "ALLOWED" in l))[:3]
    print(("CAUGHT " if fails and fails[-1].split()[-1] != "0" else "MISSED ") + name, allowed)
