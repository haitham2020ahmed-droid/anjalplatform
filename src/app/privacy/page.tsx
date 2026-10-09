import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "Privacy" };

/** 🔒 What the platform keeps about students, who sees it, and what is never sent outside. */
export default async function PrivacyPage() {
  await requireActor();
  const me = (await getActor())!.user;
  const item = (t: string, d: string) => <li className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="font-bold text-brand-navy">{t}</p><p className="mt-1 text-slate-700">{d}</p></li>;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="🔒" title="Privacy" subtitle="How Al-Anjal English looks after students’ data." />
      <ul className="grid gap-3 md:grid-cols-2">
        {item("What we keep", "Name, class, the school student ID, answers on the platform, MAP scores entered or imported by the school, and the words a student looks up. No national ID, address or phone number of students.")}
        {item("Who sees it", "The student, their parents (only what the teacher shares), the student’s teachers, grade coordinators for their grades, and the head of department.")}
        {item("AI tools", "AI is used only to check and tag questions of the question bank. No student name, answer or score is ever sent to an AI service (the platform blocks it).")}
        {item("Dictionary", "Only the looked-up word is sent to the free dictionary service, never who looked it up. Meanings are then kept on the platform.")}
        {item("Passwords", "Passwords are stored encrypted (hashed). Staff can reset a password; nobody can read it.")}
        {item("Questions or corrections", "Ask the head of the English department to correct or remove a student’s data.")}
      </ul>
    </AppShell>
  );
}
