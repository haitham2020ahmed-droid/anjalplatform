import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ClassSignInHost } from "@/components/class-signin/host";
import { EmptyState } from "@/components/ui-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherSignInClasses } from "@/server/auth/class-signin";
import { printQrPanels, printSignInsView } from "@/server/auth/class-print-qr";
import { PrintQrPanel } from "@/components/class-signin/print-panel";
import { getT } from "@/i18n/server";

export const metadata = { title: "Class sign-in" };
export const dynamic = "force-dynamic";

/**
 * 📱 Class sign-in (r76): the teacher picks ONE of the classes they teach (read live: a change by the admin shows at
 * once; one class → it opens directly) and a big QR appears with the class's live list next to it.
 */
export default async function ClassSignInPage({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = await teacherSignInClasses(repo, actor);
  const pick = classes.find((c) => c.id === sp.classId) ?? (classes.length === 1 ? classes[0] : null);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = (process.env.APP_URL ?? `${proto}://${host}`).replace(/\/$/, "");
  // 🖨 r85: the printable QR + class code of each class (the picked one, or all of them on the chooser)
  const panels = (await printQrPanels(repo, actor)).filter((p) => !pick || p.classId === pick.id);
  const signedIn = await Promise.all(panels.map((p) => printSignInsView(repo, actor, p.classId)));
  const printPanels = panels.length > 0 && (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {panels.map((p, i) => <PrintQrPanel key={p.classId} initial={p} base={base} signedIn={signedIn[i]} />)}
    </div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📱" title="Class sign-in"
        subtitle={t("Show a QR code: students scan it, tap their name and they are in.")} />
      {classes.length === 0 && <EmptyState icon="👥" title="You have no classes yet" text="Ask the school admin to add you to your classes." />}
      {classes.length > 0 && !pick && (
        <section aria-label={t("Choose a class")}>
          <h2 className="mb-3 text-lg font-semibold text-ink">{t("Choose a class")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <li key={c.id}>
                <Link prefetch={false} href={`/teacher/class-signin?classId=${encodeURIComponent(c.id)}`}
                  className="flex min-h-20 items-center justify-center rounded-2xl bg-surface px-4 text-2xl font-bold text-brand-navy ring-1 ring-line hover:ring-brand-teal">
                  <bdi>{c.name}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!pick && printPanels}
      {pick && (
        <>
          {classes.length > 1 && (
            <nav aria-label={t("Class")} className="mb-4 flex flex-wrap gap-2">
              {classes.map((c) => (
                <Link key={c.id} prefetch={false} href={`/teacher/class-signin?classId=${encodeURIComponent(c.id)}`} aria-current={c.id === pick.id ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${c.id === pick.id ? "bg-brand-navy text-white" : "bg-surface ring-1 ring-line hover:ring-brand-teal"}`}><bdi>{c.name}</bdi></Link>
              ))}
            </nav>
          )}
          <ClassSignInHost key={pick.id} classId={pick.id} className={pick.name} base={base} />
          {printPanels}
        </>
      )}
    </AppShell>
  );
}
