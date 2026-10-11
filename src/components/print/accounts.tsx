/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🪪 Printable student accounts, in the print kit's design (server-safe, no hooks):
 *   AccountSheet   one clean class sheet per class: class, teacher, grade at the top; a table
 *                  # | Student name | Username | Password | QR (about 15 per A4 page); optional "cut here" strips
 *   SignInCards    colourful sign-in cards, 8 per A4 page (2 × 4): name, class, username, password, QR and a short
 *                  "How to sign in" line, with dashed cut guides
 * Used by the teacher's Download Accounts and the admin's Student Sign-in Cards. Passwords are shown only when the
 * loader returns them (the password is the username); otherwise the page passes the "ask your teacher" words.
 */
import { qrPath } from "@/lib/qr";
import { CutLine, PrintFooter, PrintHeader, PrintMeta, PrintPage, tEn, cycleColor, type T } from "./print-kit";

export interface AccountEntry { userId: string; name: string; username: string; number?: string; password: string | null; className: string; grade: number }
export interface AccountClass { className: string; grade: number; teacher?: string | null; rows: AccountEntry[] }

export const loginUrl = (base: string, username: string) => `${base.replace(/\/$/, "")}/login?u=${encodeURIComponent(username)}`;

/** A QR code as an inline SVG (black on white, crisp edges). No dir attribute on SVG. */
export function Qr({ text, label, size }: { text: string; label: string; size: string }) {
  const q = qrPath(text);
  return (
    <svg viewBox={`0 0 ${q.total} ${q.total}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={label} className="pk-qr">
      <rect width="100%" height="100%" fill="#fff" /><path d={q.d} fill="#000" />
    </svg>
  );
}

export const ACCOUNTS_CSS = `
.pk-acc td{height:13mm;padding-top:3px;padding-bottom:3px}
.pk-acc .pk-n{width:8mm;color:#64748b;font-weight:600;text-align:center}
.pk-acc .pk-name{font-weight:700;color:#1f3a68;font-size:13px}
.pk-acc .pk-code{direction:ltr;unicode-bidi:isolate;font-weight:700;letter-spacing:.03em;font-size:13px;color:#0f172a;background:#f1f5f9;border-radius:8px;padding:2px 8px;display:inline-block}
.pk-acc .pk-hidden{font-size:11px;color:#64748b}
.pk-acc .pk-qrcell{width:17mm;text-align:center;padding:3px}
.pk-acc .pk-qr{display:block;margin:0 auto}
.pk-acc.pk-cutrows td{border-bottom:1.5px dashed #94a3b8}
.pk-acc.pk-cutrows .pk-n::before{content:"✂";display:block;font-size:10px;color:#94a3b8;line-height:1}
.pk-howto{margin:0 0 10px;padding:7px 12px;border-radius:12px;background:#eef8f8;color:#11706f;font-size:11.5px}
.pk-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm}
.pk-cardcell{border:1.3px dashed #94a3b8;border-radius:5mm;padding:2mm;break-inside:avoid;page-break-inside:avoid}
.pk-card{position:relative;display:flex;flex-direction:column;height:52mm;border-radius:4mm;overflow:hidden;background:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--pk-c) 35%,#fff)}
.pk-card-top{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:2mm 3.5mm;background:var(--pk-c);color:#fff}
.pk-card-top .pk-logo{font-size:14px}
.pk-card-top small{font-size:9px;opacity:.92;text-align:end;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:55%}
.pk-card-body{display:flex;gap:3mm;padding:2.5mm 3.5mm;flex:1;min-height:0;background:linear-gradient(180deg,color-mix(in srgb,var(--pk-c) 7%,#fff),#fff 70%)}
.pk-card-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:1mm}
.pk-card-name{font-size:15px;font-weight:700;color:#1f3a68;line-height:1.15;overflow-wrap:anywhere}
.pk-card-class{font-size:10.5px;color:#475569}
.pk-card-row{display:flex;align-items:center;gap:4px;font-size:10px;color:#475569}
.pk-card-row b{direction:ltr;unicode-bidi:isolate;font-size:12.5px;color:#0f172a;background:#fff;border:1px solid color-mix(in srgb,var(--pk-c) 30%,#fff);border-radius:6px;padding:0 6px;overflow-wrap:anywhere}
.pk-card-qr{flex:none;display:flex;flex-direction:column;align-items:center;gap:1mm;font-size:8.5px;color:#64748b}
.pk-card-how{padding:1.5mm 3.5mm;font-size:9px;color:#475569;border-top:1px dashed color-mix(in srgb,var(--pk-c) 30%,#fff)}
.pk-cardpage .pk-head{margin-bottom:4px}
@media print{.pk-cardpage .pk-stripe{margin-bottom:6px}}
@media (max-width:640px){.pk-cards{grid-template-columns:1fr}.pk-card{height:auto}}
`;

/** The class sheet (one page per class; ~15 rows a page, the header row repeats on the next page). */
export function AccountSheet({ classes, school, base, cut = false, hidden = "ask your teacher", date = new Date(), t = tEn }: {
  classes: AccountClass[]; school: string; base: string; cut?: boolean; hidden?: string; date?: Date; t?: T;
}) {
  const site = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <>
      {classes.map((c) => (
        <PrintPage key={`${c.className}-${c.grade}`} label={t("Class accounts")} className="pk-sheetpage">
          <PrintHeader title={t("Class accounts")} subtitle={t("Student sign-in details · keep this sheet with the teacher")} school={school} date={date} t={t} />
          <PrintMeta items={[{ label: t("Class"), value: c.className }, { label: t("Teacher"), value: c.teacher ?? "" }, { label: t("Grade"), value: String(c.grade) }, { label: t("Students"), value: String(c.rows.length) }]} />
          <p className="pk-howto">{t("How to sign in: scan the QR code, or go to {site} and type the username and password.", { site })}</p>
          <table className={`pk-table pk-acc ${cut ? "pk-cutrows" : ""}`} data-pk="accounts">
            <thead><tr><th scope="col" className="pk-mid">#</th><th scope="col">{t("Student Name")}</th><th scope="col">{t("Username")}</th><th scope="col">{t("Password")}</th><th scope="col" className="pk-mid">QR</th></tr></thead>
            <tbody>
              {c.rows.map((r, i) => (
                <tr key={r.userId} data-pk="account-row">
                  <td className="pk-n">{i + 1}</td>
                  <td className="pk-name" dir="auto"><bdi>{r.name}</bdi></td>
                  <td><span className="pk-code">{r.username}</span></td>
                  <td>{r.password ? <span className="pk-code">{r.password}</span> : <span className="pk-hidden">{t(hidden)}</span>}</td>
                  <td className="pk-qrcell"><Qr text={loginUrl(base, r.username)} label={t("QR code to sign in as {name}", { name: r.username })} size="11mm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {cut ? <CutLine t={t} /> : null}
          <PrintFooter t={t} right={<>{c.className} · {t("Grade {n}", { n: c.grade })}</>} />
        </PrintPage>
      ))}
    </>
  );
}

/** Sign-in cards, 8 per A4 page, with dashed cut guides. */
export function SignInCards({ cards, school, base, hidden = "ask your teacher", date = new Date(), t = tEn }: {
  cards: AccountEntry[]; school: string; base: string; hidden?: string; date?: Date; t?: T;
}) {
  const site = base.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const pages: AccountEntry[][] = [];
  for (let i = 0; i < cards.length; i += 8) pages.push(cards.slice(i, i + 8));
  return (
    <>
      {pages.map((p, pi) => (
        <PrintPage key={pi} label={t("Sign-in cards")} className="pk-cardpage">
          <PrintHeader title={t("Sign-in cards")} subtitle={t("Cut along the dashed lines")} school={school} date={date} t={t} />
          <div className="pk-cards" data-pk="cards">
            {p.map((c, i) => (
              <div key={c.userId} className="pk-cardcell">
                <article className="pk-card" style={{ ["--pk-c" as string]: cycleColor(pi * 8 + i) }} data-pk="card">
                  <div className="pk-card-top"><span className="pk-logo">Al-<i>Anjal</i></span><small><bdi>{school}</bdi></small></div>
                  <div className="pk-card-body">
                    <div className="pk-card-info">
                      <div className="pk-card-name" dir="auto"><bdi>{c.name}</bdi></div>
                      <div className="pk-card-class">{c.className} · {t("Grade {n}", { n: c.grade })}</div>
                      <div className="pk-card-row">{t("Username")}: <b>{c.username}</b></div>
                      <div className="pk-card-row">{t("Password")}: {c.password ? <b>{c.password}</b> : <span>{t(hidden)}</span>}</div>
                    </div>
                    <div className="pk-card-qr"><Qr text={loginUrl(base, c.username)} label={t("QR code to sign in as {name}", { name: c.username })} size="24mm" /><span>{t("Scan me")}</span></div>
                  </div>
                  <div className="pk-card-how">{t("How to sign in: scan the code, or go to {site}.", { site })}</div>
                </article>
              </div>
            ))}
          </div>
        </PrintPage>
      ))}
    </>
  );
}
