/**
 * Outgoing email. Configured by environment variables (all optional — without them email is OFF and
 * messages still arrive on the platform):
 *
 *   SMTP_HOST    e.g. smtp.gmail.com
 *   SMTP_PORT    465 (SMTP_SECURE=true) or 587 (STARTTLS)
 *   SMTP_SECURE  "true" for port 465
 *   SMTP_USER    login (for Gmail: the full Gmail address)
 *   SMTP_PASS    password (for Gmail: an app password)
 *   MAIL_FROM    "Literise <name@gmail.com>"
 */
import { sendSmtp, type SmtpOptions } from "./smtp";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailTransport = (mail: OutgoingMail & { from: string }) => Promise<void>;

let testTransport: MailTransport | null = null;

/** Tests: replace the SMTP transport (null = back to the environment). */
export function setMailTransportForTests(fn: MailTransport | null): void {
  testTransport = fn;
}

export function mailConfig(env: NodeJS.ProcessEnv = process.env): (SmtpOptions & { from: string }) | null {
  const host = env.SMTP_HOST?.trim();
  const from = (env.MAIL_FROM?.trim() || env.SMTP_USER?.trim()) ?? "";
  if (!host || !from) return null;
  const secure = (env.SMTP_SECURE ?? "").trim().toLowerCase() === "true";
  const port = Number(env.SMTP_PORT) || (secure ? 465 : 587);
  return { host, port, secure, user: env.SMTP_USER?.trim() || undefined, pass: env.SMTP_PASS?.replace(/\s+/g, "") || undefined, from, timeoutMs: 20_000 };
}

/** True when email can be sent (SMTP configured, or a test transport is set). */
export function mailEnabled(): boolean {
  return testTransport !== null || mailConfig() !== null;
}

/** The sender shown on the admin page ("" when email is off). */
export function mailFrom(): string {
  return testTransport ? "test@localhost" : mailConfig()?.from ?? "";
}

/** Sends one email. Throws when email is off or the server refuses. */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (testTransport) return testTransport({ ...mail, from: "test@localhost" });
  const cfg = mailConfig();
  if (!cfg) throw new Error("Email is not configured (SMTP_HOST / MAIL_FROM).");
  await sendSmtp(cfg, { from: cfg.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}
