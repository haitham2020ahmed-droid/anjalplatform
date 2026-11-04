import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { serverStatus, type RawDb } from "@/server/admin/server-status";
import { db } from "@/lib/db";

export const metadata = { title: "Server status" };
export const dynamic = "force-dynamic";

function hms(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * 🖥 Server status: a glance a non-technical admin can check before something goes wrong — is the server up, does
 * it have memory to spare, can it reach the database? Read-only (no button changes anything). School admin /
 * platform admin only, same gate as System check. See src/server/admin/server-status.ts for what each number means.
 */
export default async function ServerStatusPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const s = await serverStatus(db as unknown as RawDb);
  const tile = (icon: string, label: string, value: string, warn?: boolean) => (
    <div className={`rounded-2xl p-4 ring-1 ${warn ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-200"}`}>
      <p className="text-xs font-semibold text-slate-500">{icon} {label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-900" : "text-brand-navy"}`} dir="ltr">{value}</p>
    </div>
  );
  void actor;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🖥" title={t("Server status")}
        subtitle={t("Is the server up, does it have memory to spare, can it reach the database? Nothing here changes anything.")} />

      <Section title={t("Right now")} icon="📟" className="mb-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tile("⏱", t("Uptime"), hms(s.uptimeSeconds))}
          {tile("🧠", t("Memory in use"), `${s.memory.rssMB} MB`, s.memoryBusyNow)}
          {tile("🟢", "Node.js", s.nodeVersion)}
          {tile("🗄", t("Database"), s.db.ok ? `${t("OK")} (${s.db.ms} ms)` : t("Unreachable"), !s.db.ok)}
        </div>
        {s.memoryBusyNow && (
          <p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            ⚠ {t("Memory is high ({used} MB of a {limit} MB busy-line). The server is pausing optional background work until it drops; students and teachers can keep using the platform.", { used: s.memory.rssMB, limit: s.memoryBusyMb })}
          </p>
        )}
        {!s.db.ok && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
            🚨 {t("The database could not be reached just now:")} <span dir="ltr" className="font-mono">{s.db.error}</span>
          </p>
        )}
      </Section>

      <Section title={t("Memory detail")} icon="🧮" className="mb-5" hint={t("How Node.js is using the memory the server has. RSS is the number that matters: it is what Render compares to the plan's limit.")}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" dir="ltr">
          <div><dt className="text-slate-500">RSS</dt><dd className="font-mono font-semibold">{s.memory.rssMB} MB</dd></div>
          <div><dt className="text-slate-500">Heap used</dt><dd className="font-mono font-semibold">{s.memory.heapUsedMB} MB</dd></div>
          <div><dt className="text-slate-500">Heap total</dt><dd className="font-mono font-semibold">{s.memory.heapTotalMB} MB</dd></div>
          <div><dt className="text-slate-500">External + buffers</dt><dd className="font-mono font-semibold">{s.memory.externalMB + s.memory.arrayBuffersMB} MB</dd></div>
        </dl>
        {s.buildsWaitingNow > 0 && <p className="mt-2 text-xs text-slate-500">{t("{n} big cache build waiting its turn right now.", { n: s.buildsWaitingNow })}</p>}
      </Section>

      <Section title={t("Memory watch (the “black box”)")} icon="🧠" className="mb-5"
        hint={t("A background watcher (src/server/monitoring/memory.ts) samples this process every 15 seconds and writes a log line when memory is high or jumps, naming the last pages opened — so a crash in Render's logs says what led to it. Full history lives in Render's own log viewer, not here; this shows this server process's most recent pages since it last started.")}>
        {s.recentPages ? (
          <p className="font-mono text-xs text-slate-700" dir="ltr">{s.recentPages}</p>
        ) : (
          <p className="text-sm text-slate-500">{t("No pages opened on this server process yet.")}</p>
        )}
      </Section>

      <Section title={t("Related pages")} icon="🔗" className="mb-5">
        <ul className="list-inside list-disc space-y-1 text-sm">
          <li><Link href="/admin/system" className="font-semibold text-brand-teal underline">{t("System check")}</Link> — {t("is the database up to date with the code?")}</li>
          <li><Link href="/admin/backup" className="font-semibold text-brand-teal underline">{t("Backup")}</Link> — {t("a readable Excel copy of the school's data")}</li>
          <li><Link href="/admin/errors" className="font-semibold text-brand-teal underline">{t("Errors")}</Link> — {t("recent application errors")}</li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">{t("For how the database itself is backed up and restored, see docs/BACKUP-AND-RESTORE.md in the project.")}</p>
      </Section>

      <p className="text-xs text-muted" dir="ltr">{s.now}</p>
    </AppShell>
  );
}
