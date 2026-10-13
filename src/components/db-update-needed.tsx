/**
 * 🧱 A page of a NEW feature whose tables are not in the database yet (the update's `npx prisma db push` did not run):
 * a clear message instead of "Something went wrong". Admins get the link to Admin → System check (what is missing).
 */
import { AppShell } from "./app-shell";
import { getActor, repo } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { nafsReady } from "@/server/nafs/ready";
import { DB_UPDATE_NEEDED } from "@/server/db/schema-errors";

export async function DbUpdateNeeded() {
  const [{ t }, me] = await Promise.all([getT(), getActor()]);
  const role = String(me?.actor.role ?? "");
  const admin = role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  return (
    <div role="status" className="mx-auto max-w-xl rounded-2xl bg-amber-50 p-6 text-amber-950 ring-1 ring-amber-200">
      <p className="text-lg font-bold">🧱 {t(DB_UPDATE_NEEDED)}</p>
      <p className="mt-2 text-sm">{t("This part of the platform was added by the latest update. It opens as soon as the database is updated.")}</p>
      {admin ? (
        <a href="/admin/system" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">{t("System check")}</a>
      ) : (
        <p className="mt-2 text-sm">{t("Please tell the school admin.")}</p>
      )}
    </div>
  );
}

/** The whole page (frame + message). */
export async function DbUpdatePage() {
  const me = await getActor();
  return <AppShell name={String(me?.user.displayName ?? "")}><DbUpdateNeeded /></AppShell>;
}

/** NAFS pages: the message page while the NAFS tables are missing, else null (the page opens as usual). */
export async function nafsDbGate(): Promise<React.ReactElement | null> {
  return (await nafsReady(repo)) ? null : <DbUpdatePage />;
}
