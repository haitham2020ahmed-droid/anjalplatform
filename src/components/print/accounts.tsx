/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🪪 Printable student accounts, in the print kit's design (server-safe, no hooks):
 *   AccountSheet   one clean class sheet per class: class, teacher, grade at the top; a table
 *                  # | Student name | Username | Password | QR (about 15 per A4 page); optional "cut here" strips
 *   SignInCards    sign-in cards in a fixed 2 × 4 grid (8 per A4 page, 92 × 62 mm each): school, name, class, a large
 *                  monospace Username / Password box, QR and the website, with shared dashed cut lines
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
.pk-cardpage{padding:16px}
.pk-cards-top{display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap;margin:0 0 3mm;font-size:10px;color:#475569;line-height:1.3}
.pk-cards-top b{color:#1f3a68;font-size:12px}
.pk-cards-top span{overflow-wrap:anywhere}
.pk-cards-top .pk-cards-pg{margin-inline-start:auto;white-space:nowrap;direction:ltr;unicode-bidi:isolate}
.pk-cards{display:grid;grid-template-columns:repeat(2,92mm);grid-auto-rows:62mm;gap:0;justify-content:center;border-top:.3mm dashed #94a3b8;border-inline-start:.3mm dashed #94a3b8}
.pk-cardcell{width:92mm;height:62mm;padding:3.5mm;border-bottom:.3mm dashed #94a3b8;border-inline-end:.3mm dashed #94a3b8;break-inside:avoid;page-break-inside:avoid;overflow:hidden}
.pk-card{display:flex;flex-direction:column;gap:1.6mm;width:100%;height:100%;min-width:0;overflow:hidden;border-radius:3mm;background:#fff;border:.35mm solid #cbd5e1;border-top:1.6mm solid var(--pk-c);padding:2mm 3mm 2.2mm}
.pk-card-top{display:flex;align-items:baseline;gap:2mm;min-width:0;font-size:8.5px;line-height:1.2;color:#64748b}
.pk-card-top .pk-logo{font-size:10px;font-weight:800;color:#1f3a68;flex:none}
.pk-card-top .pk-logo i{color:#b7791f}
.pk-card-school{min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pk-card-head{display:flex;gap:2.5mm;align-items:flex-start;min-width:0;height:18mm;flex:none}
.pk-card-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:.8mm}
.pk-card-name{font-size:15px;font-weight:700;color:#0f172a;line-height:1.2;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;max-height:2.4em}
.pk-card-name.pk-long{font-size:12.5px}
.pk-card-class{font-size:10.5px;font-weight:600;color:#334155;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pk-card-qr{flex:none;width:18mm;height:18mm}
.pk-card-qr .pk-qr{display:block;width:18mm;height:18mm}
.pk-cred{display:grid;grid-template-columns:auto minmax(0,1fr);margin:0;border:.35mm solid #1f3a68;border-radius:2mm;overflow:hidden;flex:none}
.pk-cred dt,.pk-cred dd{margin:0;display:flex;align-items:center;min-width:0;height:8.4mm;padding:0 2.2mm}
.pk-cred dt{font-size:9px;font-weight:700;color:#1f3a68;background:#eef3fa;max-width:24mm;line-height:1.1;overflow-wrap:anywhere}
.pk-cred dd{background:#fff}
.pk-cred dt+dd{border-inline-start:.35mm solid #1f3a68}
.pk-cred dd:nth-of-type(1),.pk-cred dt:nth-of-type(1){border-bottom:.35mm solid #1f3a68}
.pk-val{display:block;max-width:100%;direction:ltr;unicode-bidi:isolate;text-align:left;font-family:"Consolas","DejaVu Sans Mono","Menlo","Courier New",ui-monospace,monospace;font-variant-numeric:slashed-zero;font-feature-settings:"zero" 1;font-weight:700;color:#000;letter-spacing:.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-fit-1{font-size:19px}
.pk-fit-2{font-size:17px}
.pk-fit-3{font-size:15px}
.pk-fit-4{font-size:12.5px}
.pk-fit-5{font-size:10.5px;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;max-height:2.2em}
.pk-cred .pk-hidden{font-size:10px;color:#475569}
.pk-card-site{margin-top:auto;display:flex;align-items:baseline;gap:1.5mm;min-width:0;font-size:8.5px;color:#475569;line-height:1.2}
.pk-card-site b{min-width:0;direction:ltr;unicode-bidi:isolate;font-size:10px;color:#0f172a;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
@media print{.pk-cardpage{padding:0}.pk-cards-top{margin-bottom:2.5mm}}
@media screen and (max-width:820px){.pk-cards{grid-template-columns:minmax(0,92mm);border:0;gap:3mm}.pk-cardcell{width:100%;border:.3mm dashed #94a3b8}}
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

/** The size class of a username / password: shorter values print bigger; very long ones wrap onto 2 lines. */
export function fitClass(v: string): string {
  const n = [...v].length;
  return n <= 12 ? "pk-fit-1" : n <= 16 ? "pk-fit-2" : n <= 20 ? "pk-fit-3" : n <= 24 ? "pk-fit-4" : "pk-fit-5";
}

/** The site address as printed on a card ("anjal.example.com"). */
export const siteOf = (base: string) => base.replace(/^https?:\/\//, "").replace(/\/$/, "");

export const CARDS_PER_PAGE = 8;

/**
 * Sign-in cards: a fixed 2 × 4 grid of 92 × 62 mm cards (8 per A4 page) with dashed cut lines; every card is the same
 * size and nothing can run out of it (names stop at 2 lines, values shrink to fit, the rest ends with "…").
 * Card: platform + school (small) · name · class · a Username / Password box in a large monospace font · QR · website.
 */
export function SignInCards({ cards, school, base, hidden = "ask your teacher", t = tEn }: {
  cards: AccountEntry[]; school: string; base: string; hidden?: string; date?: Date; t?: T;
}) {
  const site = siteOf(base);
  const pages: AccountEntry[][] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) pages.push(cards.slice(i, i + CARDS_PER_PAGE));
  return (
    <>
      {pages.map((p, pi) => (
        <PrintPage key={pi} label={t("Sign-in cards")} className="pk-cardpage">
          <div className="pk-cards-top" data-pk="cards-top">
            <b>{t("Sign-in cards")}</b>
            {school ? <span><bdi>{school}</bdi></span> : null}
            <span>✂ {t("Cut along the dashed lines")}</span>
            {pages.length > 1 ? <span className="pk-cards-pg">{t("Page {n} of {m}", { n: pi + 1, m: pages.length })}</span> : null}
          </div>
          <div className="pk-cards" data-pk="cards">
            {p.map((c, i) => (
              <div key={c.userId} className="pk-cardcell">
                <article className="pk-card" style={{ ["--pk-c" as string]: cycleColor(pi * CARDS_PER_PAGE + i) }} data-pk="card">
                  <div className="pk-card-top"><span className="pk-logo">Lite<i>rise</i></span>{school ? <span className="pk-card-school"><bdi>{school}</bdi></span> : null}</div>
                  <div className="pk-card-head">
                    <div className="pk-card-who">
                      <div className={`pk-card-name${[...c.name].length > 40 ? " pk-long" : ""}`} dir="auto" title={c.name}><bdi>{c.name}</bdi></div>
                      <div className="pk-card-class"><bdi>{c.className}</bdi> · {t("Grade {n}", { n: c.grade })}</div>
                    </div>
                    <div className="pk-card-qr"><Qr text={loginUrl(base, c.username)} label={t("QR code to sign in as {name}", { name: c.username })} size="18mm" /></div>
                  </div>
                  <dl className="pk-cred" data-pk="cred">
                    <dt>{t("Username")}</dt>
                    <dd><span className={`pk-val ${fitClass(c.username)}`} dir="ltr" data-pk="username">{c.username}</span></dd>
                    <dt>{t("Password")}</dt>
                    <dd>{c.password ? <span className={`pk-val ${fitClass(c.password)}`} dir="ltr" data-pk="password">{c.password}</span> : <span className="pk-hidden">{t(hidden)}</span>}</dd>
                  </dl>
                  <div className="pk-card-site">{t("Website")}: <b dir="ltr">{site}</b></div>
                </article>
              </div>
            ))}
          </div>
        </PrintPage>
      ))}
    </>
  );
}
