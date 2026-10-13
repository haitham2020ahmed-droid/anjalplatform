import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { systemCheckNow } from "@/server/admin/system-check-run";
import { DB_PUSH } from "@/server/admin/system-check";
import { schemaGapsSeen } from "@/server/db/schema-errors";

export const metadata = { title: "System check" };
export const dynamic = "force-dynamic";

/**
 * 🧱 System check: does the live database have every table, column, enum value and index this version of the code
 * expects? (After an update, `npx prisma db push` must run on the server; when it did not, new pages fail.)
 * Read-only: two information_schema queries. School admin / platform admin only.
 */
export default async function SystemCheckPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const [{ t }, r] = await Promise.all([getT(), systemCheckNow()]);
  const c = r.check;
  const seen = schemaGapsSeen(24 * 3_600_000);
  const missing = c ? c.missingTables.length + c.missingColumns.length + c.missingEnumValues.length + c.missingIndexes.length : 0;
  const code = "rounded bg-slate-900 px-2 py-1 font-mono text-sm text-white";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🧱" title="System check"
        subtitle={t("The tables and columns the platform's code expects, compared with the live database. Nothing is changed here.")} />
      {r.error && <p role="alert" className="mb-5 rounded-2xl bg-rose-50 p-5 text-rose-900 ring-1 ring-rose-200">{t("The check could not read the database:")} <span dir="ltr" className="font-mono text-sm">{r.error}</span></p>}
      {c && c.ok && (
        <p role="status" className="mb-5 rounded-2xl bg-emerald-50 p-5 font-semibold text-emerald-900 ring-1 ring-emerald-200">
          ✅ {t("The database matches the code: {t} tables, {c} columns.", { t: c.expectedTables, c: c.expectedColumns })}
        </p>
      )}
      {c && !c.ok && (
        <div role="alert" className="mb-5 rounded-2xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200">
          <p className="text-lg font-bold">⚠ {t("The database is behind the code: {n} thing(s) missing.", { n: missing })}</p>
          <p className="mt-2">{t("Run this on the server (Render → Shell), then reload this page:")} <code dir="ltr" className={code}>{DB_PUSH}</code></p>
          <p className="mt-1 text-sm">{t("It adds the missing tables and columns. If it warns that data would be lost, stop and send the warning to the developer.")}</p>
        </div>
      )}
      {c && c.missingTables.length > 0 && (
        <Section title="Missing tables" icon="🗂️" className="mb-5">
          <ul className="flex flex-wrap gap-2" dir="ltr">{c.missingTables.map((x) => <li key={x} className="rounded-full bg-rose-50 px-3 py-1 font-mono text-sm text-rose-900 ring-1 ring-rose-200">{x}</li>)}</ul>
        </Section>
      )}
      {c && c.missingColumns.length > 0 && (
        <Section title="Missing columns" icon="🧩" className="mb-5">
          <ul className="flex flex-wrap gap-2" dir="ltr">{c.missingColumns.map((x) => <li key={`${x.table}.${x.column}`} className="rounded-full bg-rose-50 px-3 py-1 font-mono text-sm text-rose-900 ring-1 ring-rose-200">{x.table}.{x.column}</li>)}</ul>
        </Section>
      )}
      {c && c.missingEnumValues.length > 0 && (
        <Section title="Missing choices (enum values)" icon="🔤" className="mb-5">
          <ul className="space-y-1 font-mono text-sm" dir="ltr">{c.missingEnumValues.map((x) => <li key={`${x.table}.${x.column}`}>{x.table}.{x.column}: {x.values.join(", ")}</li>)}</ul>
        </Section>
      )}
      {c && c.missingIndexes.length > 0 && (
        <Section title="Missing indexes (pages are slower without them)" icon="⚡" className="mb-5">
          <ul className="space-y-1 font-mono text-sm" dir="ltr">{c.missingIndexes.map((x) => <li key={`${x.table}(${x.columns.join(",")})`}>{x.table} ({x.columns.join(", ")})</li>)}</ul>
        </Section>
      )}
      {seen.length > 0 && (
        <Section title="Noticed by the pages (last 24 hours)" icon="👀" className="mb-5" hint={t("Pages that met a missing table or column opened anyway, with that part left empty.")}>
          <ul className="space-y-1 font-mono text-sm" dir="ltr">{seen.map((x) => <li key={x.what}>{x.what} · {x.where}</li>)}</ul>
        </Section>
      )}
      {c && <p className="text-xs text-muted">{t("Checked {t} tables in {ms} ms.", { t: c.liveTables, ms: r.ms })}</p>}
    </AppShell>
  );
}
