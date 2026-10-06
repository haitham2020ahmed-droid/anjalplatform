import subprocess, shutil, os, tempfile, sys
BAK = os.path.join(tempfile.gettempdir(), "ela-mutation.bak")
muts = [
 ("network block removed", "src/reports/pdf.ts", 'await ctx.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort("blockedbyclient")));', ""),
 ("JavaScript enabled", "src/reports/pdf.ts", "javaScriptEnabled: false, offline: true", "javaScriptEnabled: true"),
 ("HTML escaping bypassed", "src/reports/html.ts", "  return esc(v);\n}", "  return String(v);\n}"),
 ("formula text written as formula", "src/reports/xlsx.ts", 'return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t${space}>${text}</t></is></c>`;', 'return text.startsWith("=") ? `<c r="${ref}" s="${c.s}"><f>${text.slice(1)}</f></c>` : `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t${space}>${text}</t></is></c>`;'),
 ("parent sees all students", "src/server/queries/parent.ts", "const ids = [...(actor.parentChildIds ?? [])];", "const ids = (await repo.findMany(\"Student\", {})).map((s) => String(s.id));"),
 ("rate limit removed", "src/server/reports/service.ts", "if (!rl.allowed) throw new RateLimitedError", "if (false) throw new RateLimitedError"),
 ("audit removed", "src/server/reports/service.ts", "  await audit(repo, {", "  if (false) await audit(repo, {"),
 ("growth card back to overall average", "src/server/reports/builders.ts", 'const paired = pairedGrowth(a.growth);', 'const paired = a.growth.growth;'),
 ("student report needs no permission", "src/server/reports/service.ts", 'if (req.kind === "student") assertCan(actor, "reports:read");', 'if (req.kind === "student") {}'),
 ("logo content not sniffed", "src/reports/logo.ts", "  const mime = sniffImage(bytes);", "  const mime = \"image/png\" as const;"),
 ("RTL sheets off", "src/reports/xlsx.ts", '<sheetView workbookViewId="0"${rtl ? \' rightToLeft="1"\' : ""}>', '<sheetView workbookViewId="0">'),
]
for name, f, a, b in muts:
    src = open(f).read()
    assert a in src, (name, a[:50])
    shutil.copy(f, BAK)
    open(f, "w").write(src.replace(a, b, 1))
    r = subprocess.run(["npx", "tsx", "--test", "tests/reports.test.ts"], capture_output=True, text=True)
    shutil.copy(BAK, f)
    fails = [l for l in r.stdout.splitlines() if l.strip().startswith("# fail")]
    caught = fails and fails[-1].split()[-1] != "0"
    print(("CAUGHT " if caught else "MISSED ") + name)
