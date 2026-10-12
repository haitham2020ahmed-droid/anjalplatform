import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { BankTabs } from "../bank-tabs";
import { DuplicatesTool } from "./duplicates-tool";

export const metadata = { title: "Duplicate Questions" };

/** 👯 Find and remove exact duplicate questions (admins). */
export default async function DuplicatesPage() {
  await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Questions" }} icon="👯" title="Duplicate Questions"
        subtitle={t("Exact copies: the same question text, the same answer choices, the same correct answer and type (and the same passage). Capital letters, spaces, end punctuation and curly quotes do not matter. One copy is kept; students' answers and every link move to it.")} />
      <BankTabs />
      <p role="note" className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 font-semibold text-amber-950 ring-1 ring-amber-300">
        <span aria-hidden="true">⚠️</span>{t("Take a database backup first.")}
        <Link href="/admin/backup" className="underline">{t("Open Backup")}</Link>
      </p>
      <DuplicatesTool />
    </AppShell>
  );
}
