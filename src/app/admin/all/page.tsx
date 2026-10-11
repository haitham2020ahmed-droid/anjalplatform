import { AppShell } from "@/components/app-shell";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { adminMayUse } from "@/server/admin/tools";
import { ADMIN_GROUPS, ADMIN_TOOLS } from "@/components/admin-tools";
import { AllToolsList } from "./all-tools-list";

export const metadata = { title: "All Admin Tools" };

/**
 * 🧰 All Admin Tools: every admin page in the five Admin Home groups, with one search box. The Admin Home shows
 * only the 4 most used per group; "More" there opens this page at the group (Home → More → page = 2 clicks).
 */
export default async function AllAdminTools() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const groups = ADMIN_GROUPS.map((g) => ({
    key: g.key, icon: g.icon, title: t(g.title),
    tools: ADMIN_TOOLS.filter((x) => x.group === g.key && adminMayUse(actor, x)).map((x) => ({ href: x.href, icon: x.icon, label: t(x.label), en: x.label })),
  })).filter((g) => g.tools.length);
  return (
    <AppShell name={String(me.displayName)}>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl"><span aria-hidden="true">🧰</span> {t("All Admin Tools")}</h1>
        <p className="mt-1 text-lg text-slate-600">{t("Every admin page in one list. Type a word to find a tool.")}</p>
      </header>
      <AllToolsList groups={groups} />
    </AppShell>
  );
}
