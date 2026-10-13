import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { safeIfBehind, DB_UPDATE_NEEDED } from "@/server/db/schema-errors";
import { loadTest } from "@/server/map/map-test";
import { MapTestPage } from "../../test-page";

export const metadata = { title: "MAP Test" };

/** 🧭 One MAP test: its details and its reports on the same page (MAP → MAP Test → a test). */
export default async function MapTestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const [{ t }, { id }, sp] = await Promise.all([getT(), params, searchParams]);
  let state: "ok" | "missing" | "behind" = "ok";
  try { if (!(await safeIfBehind("map-test.page", loadTest(repo, actor, id).then(() => true), false))) state = "behind"; }
  catch (e) { if (e instanceof ForbiddenError) state = "missing"; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      {state === "ok" ? <MapTestPage actor={actor} t={t} id={id} sp={sp} />
        : <EmptyState icon="🧭" title={state === "behind" ? DB_UPDATE_NEEDED : "Test not found."} action={{ href: "/teacher/map-center?tab=test", label: "MAP Test" }} />}
    </AppShell>
  );
}
