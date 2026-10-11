import { repo } from "@/server/auth/next";
import type { Actor } from "@/server/auth/rbac";
import { rewardChip } from "@/server/motivation/coins";
import { listCertificates } from "@/server/motivation/certificates";
import { getT } from "@/i18n/server";
import { badgeByCode } from "@/lib/badge-catalog";
import { Avatar, BadgeEmblem, CoinIcon } from "./avatar";
import { BonusCoinsForm, CertificateForm } from "./teacher-reward-forms";
import { CertificateList } from "./certificate-list";

/** 🎖️ The student's rewards on the teacher's student page: avatar, coins, favorite badge, bonus coins, certificates. */
export async function StudentRewardsPanel({ actor, studentId, canGive }: { actor: Actor; studentId: string; canGive: boolean }) {
  const [{ t }, chip, certs] = await Promise.all([getT(), rewardChip(repo, studentId), listCertificates(repo, actor, studentId).catch(() => [])]);
  const fav = badgeByCode(chip.favoriteBadge);
  return (
    <section id="rewards" aria-labelledby="rewards-h" className="mt-6 scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="rewards-h" className="text-lg font-semibold text-brand-navy">{t("Rewards")}</h2>
      <p className="text-sm text-slate-500">{t("Coins and badges never change levels, scores or reports.")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Avatar avatar={chip.avatar} size={56} />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200"><CoinIcon size={18} /><span dir="ltr">{chip.coins}</span> {t("coins")}</span>
        {fav && <span className="inline-flex items-center gap-1.5 text-sm text-slate-700"><BadgeEmblem code={fav.code} size={24} label={t(fav.name)} /> {t(fav.name)}</span>}
      </div>
      {canGive && (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div><h3 className="mb-2 font-semibold text-slate-800">🎁 {t("Give bonus coins")}</h3><BonusCoinsForm studentId={studentId} /></div>
          <div><h3 className="mb-2 font-semibold text-slate-800">📜 {t("Create certificate")}</h3><CertificateForm studentId={studentId} /></div>
        </div>
      )}
      <h3 className="mt-5 font-semibold text-slate-800">{t("Certificates")}</h3>
      <CertificateList items={certs} empty={t("No certificates yet.")} />
    </section>
  );
}
