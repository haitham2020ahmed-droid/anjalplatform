/**
 * A small SMTP client on node:net / node:tls (no npm packages).
 *
 *   - implicit TLS (port 465, `secure: true`) or STARTTLS (port 587: plain connect, then upgrade)
 *   - EHLO, AUTH PLAIN / AUTH LOGIN, MAIL FROM, RCPT TO, DATA (dot-stuffed), QUIT
 *   - multipart/alternative MIME (text + HTML, quoted-printable UTF-8), RFC 2047 encoded subject
 *   - a timeout on every command and readable errors (SmtpError: stage + server reply)
 *
 * A password is never sent over an unencrypted connection unless `allowInsecureAuth` is set
 * (only the local test server does that).
 */
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

export interface SmtpOptions {
  host: string;
  port: number;
  /** true = TLS from the first byte (port 465). false = plain connect, then STARTTLS when offered. */
  secure: boolean;
  user?: string;
  pass?: string;
  /** Force one AUTH method; by default PLAIN when offered, else LOGIN. */
  authMethod?: "PLAIN" | "LOGIN";
  /** Milliseconds to wait for the connection and for each server reply. Default 15 s. */
  timeoutMs?: number;
  /** Name sent in EHLO. Default "localhost". */
  clientName?: string;
  /** Allow AUTH without TLS (local test servers only). */
  allowInsecureAuth?: boolean;
  /** Fail if the server does not offer STARTTLS on a plain connection. Default: true when a password is set. */
  requireTLS?: boolean;
  /** Extra TLS options (e.g. a custom CA). */
  tls?: tls.ConnectionOptions;
}

export interface MailMessage {
  /** "Name <address@x>" or "address@x" */
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SmtpResult {
  messageId: string;
  accepted: string[];
  response: string;
}

export class SmtpError extends Error {
  constructor(message: string, readonly stage: string, readonly code?: number, readonly response?: string) {
    super(message);
    this.name = "SmtpError";
  }
}

// ------------------------------------------------------------------------------- MIME helpers

const noBreaks = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** The bare address of "Name <a@b>" or "a@b". */
export function addressOf(s: string): string {
  const m = /<([^<>]+)>\s*$/.exec(s);
  return noBreaks(m ? m[1] : s);
}

/** RFC 2047 encoded-words (UTF-8, base64) for a header value; plain ASCII stays as it is. */
export function encodeHeaderWord(value: string): string {
  const v = noBreaks(value);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  // split on whole characters so no UTF-8 sequence is cut; ≤ 45 bytes → ≤ 60 base64 chars (+12 = 72 ≤ 75)
  const words: string[] = [];
  let chunk = "";
  for (const ch of v) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** "Name <a@b>" with the name encoded when it is not ASCII. */
function encodeAddress(s: string): string {
  const addr = addressOf(s);
  const m = /^\s*"?([^"<]*?)"?\s*<[^<>]+>\s*$/.exec(noBreaks(s));
  const name = m?.[1]?.trim();
  if (!name) return addr;
  return /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/["\\]/g, "")}" <${addr}>` : `${encodeHeaderWord(name)} <${addr}>`;
}

/** Quoted-printable (RFC 2045) for UTF-8 text; lines ≤ 76 chars, CRLF line ends. */
export function quotedPrintable(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const bytes = Buffer.from(line, "utf8");
    let cur = "";
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const last = i === bytes.length - 1;
      let tok: string;
      if ((b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)) tok = String.fromCharCode(b);
      else tok = `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
      if (cur.length + tok.length > 75) { parts.push(`${cur}=`); cur = ""; }
      cur += tok;
    }
    parts.push(cur);
    out.push(parts.join("\r\n"));
  }
  return out.join("\r\n");
}

/** The full RFC 5322 message (headers + multipart/alternative body), CRLF line ends. */
export function buildMessage(msg: MailMessage, opts: { messageId?: string; date?: Date } = {}): { raw: string; messageId: string } {
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map(encodeAddress);
  const domain = addressOf(msg.from).split("@")[1] || "localhost";
  const messageId = opts.messageId ?? `<${Date.now().toString(36)}.${randomBytes(8).toString("hex")}@${domain}>`;
  const boundary = `=_alt_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${encodeAddress(msg.from)}`,
    `To: ${to.join(", ")}`,
    ...(msg.replyTo ? [`Reply-To: ${encodeAddress(msg.replyTo)}`] : []),
    `Subject: ${encodeHeaderWord(msg.subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: quoted-printable", "", quotedPrintable(body)].join("\r\n");
  const body = msg.html
    ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, "", "This is a multi-part message in MIME format.", part("text/plain", msg.text), part("text/html", msg.html), `--${boundary}--`, ""].join("\r\n")
    : ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "", quotedPrintable(msg.text), ""].join("\r\n");
  return { raw: `${headers.join("\r\n")}\r\n${body}`, messageId };
}

/** SMTP transparency (RFC 5321 §4.5.2): a line that starts with "." gets a second "."; ends with CRLF.CRLF. */
export function dotStuff(raw: string): string {
  const crlf = raw.replace(/\r\n|\r|\n/g, "\r\n");
  const stuffed = crlf.replace(/^\./, "..").replace(/\r\n\./g, "\r\n..");
  return `${stuffed}${stuffed.endsWith("\r\n") ? "" : "\r\n"}.\r\n`;
}

// ------------------------------------------------------------------------------- connection

interface Reply { code: number; lines: string[]; text: string }

class Connection {
  private buf = "";
  private lines: string[] = [];
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; stage: string } | null = null;
  private queued: Reply[] = [];
  private failure: Error | null = null;
  private onData = (d: Buffer) => this.feed(d.toString("utf8"));
  private onError = (e: Error) => this.fail(new SmtpError(`Connection error: ${e.message}`, "connection"));
  private onClose = () => this.fail(new SmtpError("The mail server closed the connection.", "connection"));

  constructor(public socket: net.Socket, private timeoutMs: number) { this.attach(socket); }

  private attach(s: net.Socket) {
    s.on("data", this.onData);
    s.on("error", this.onError);
    s.on("close", this.onClose);
  }
  private detach(s: net.Socket) {
    s.off("data", this.onData);
    s.off("error", this.onError);
    s.off("close", this.onClose);
  }

  private feed(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        const lines = this.lines;
        this.lines = [];
        const reply: Reply = { code: Number(line.slice(0, 3)), lines: lines.map((l) => l.slice(4)), text: lines.join("\n") };
        if (this.waiter) { const w = this.waiter; this.waiter = null; clearTimeout(w.timer); w.resolve(reply); }
        else this.queued.push(reply);
      }
    }
  }

  private fail(e: Error) {
    if (this.failure) return;
    this.failure = e;
    if (this.waiter) { const w = this.waiter; this.waiter = null; clearTimeout(w.timer); w.reject(new SmtpError(`${e.message} (while waiting for: ${w.stage})`, w.stage)); }
  }

  read(stage: string): Promise<Reply> {
    const q = this.queued.shift();
    if (q) return Promise.resolve(q);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new SmtpError(`The mail server did not answer in time (${stage}, ${this.timeoutMs} ms).`, stage));
        this.socket.destroy();
      }, this.timeoutMs);
      this.waiter = { resolve, reject, timer, stage };
    });
  }

  write(data: string) {
    if (this.failure) throw this.failure;
    this.socket.write(data);
  }

  /** Sends a command and checks the reply code. */
  async command(line: string, expect: number[], stage: string, shown = line): Promise<Reply> {
    this.write(`${line}\r\n`);
    const r = await this.read(stage);
    if (!expect.includes(r.code)) throw new SmtpError(`The mail server refused ${shown.split(" ")[0]} at ${stage}: ${r.code} ${r.lines.join(" ")}`.trim(), stage, r.code, r.text);
    return r;
  }

  async upgrade(opts: tls.ConnectionOptions, timeoutMs: number): Promise<void> {
    const plain = this.socket;
    this.detach(plain);
    const secure = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect({ ...opts, socket: plain });
      const t = setTimeout(() => { s.destroy(); reject(new SmtpError("TLS handshake timed out (STARTTLS).", "starttls")); }, timeoutMs);
      s.once("secureConnect", () => { clearTimeout(t); resolve(s); });
      s.once("error", (e) => { clearTimeout(t); reject(new SmtpError(`TLS handshake failed (STARTTLS): ${e.message}`, "starttls")); });
    });
    this.socket = secure;
    this.attach(secure);
  }

  close() {
    try { this.socket.end(); } catch { /* ignore */ }
    setTimeout(() => this.socket.destroy(), 200).unref?.();
  }
}

function connect(o: SmtpOptions, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s: net.Socket = o.secure
      ? tls.connect({ host: o.host, port: o.port, servername: net.isIP(o.host) ? undefined : o.host, ...o.tls })
      : net.connect({ host: o.host, port: o.port });
    const t = setTimeout(() => { s.destroy(); reject(new SmtpError(`Could not connect to ${o.host}:${o.port} in time. Check SMTP_HOST / SMTP_PORT.`, "connect")); }, timeoutMs);
    s.once(o.secure ? "secureConnect" : "connect", () => { clearTimeout(t); resolve(s); });
    s.once("error", (e) => { clearTimeout(t); reject(new SmtpError(`Could not connect to ${o.host}:${o.port}: ${e.message}`, "connect")); });
  });
}

const extensions = (r: Reply) => r.lines.slice(1).map((l) => l.toUpperCase());

/** Sends one message. Throws SmtpError with a readable message when anything fails. */
export async function sendSmtp(o: SmtpOptions, msg: MailMessage): Promise<SmtpResult> {
  const timeoutMs = o.timeoutMs ?? 15_000;
  const recipients = (Array.isArray(msg.to) ? msg.to : [msg.to]).map(addressOf).filter(Boolean);
  if (!recipients.length) throw new SmtpError("No recipient address.", "input");
  const from = addressOf(msg.from);
  if (!from.includes("@")) throw new SmtpError("MAIL_FROM is not an email address.", "input");
  const name = o.clientName ?? "localhost";
  const c = new Connection(await connect(o, timeoutMs), timeoutMs);
  try {
    const greet = await c.read("greeting");
    if (greet.code !== 220) throw new SmtpError(`The mail server did not greet: ${greet.code} ${greet.lines.join(" ")}`, "greeting", greet.code, greet.text);
    let ehlo = await c.command(`EHLO ${name}`, [250], "EHLO");
    let encrypted = o.secure;
    if (!encrypted) {
      const offers = extensions(ehlo).some((x) => x.startsWith("STARTTLS"));
      const mustTls = o.requireTLS ?? (Boolean(o.pass) && !o.allowInsecureAuth);
      if (offers) {
        await c.command("STARTTLS", [220], "STARTTLS");
        await c.upgrade({ servername: net.isIP(o.host) ? undefined : o.host, ...o.tls }, timeoutMs);
        encrypted = true;
        ehlo = await c.command(`EHLO ${name}`, [250], "EHLO after STARTTLS");
      } else if (mustTls) {
        throw new SmtpError("The mail server does not offer STARTTLS; refusing to send the password unencrypted. Use port 465 with SMTP_SECURE=true.", "STARTTLS");
      }
    }
    if (o.user && o.pass) {
      if (!encrypted && !o.allowInsecureAuth) throw new SmtpError("Refusing to log in over an unencrypted connection.", "AUTH");
      const auth = extensions(ehlo).find((x) => x.startsWith("AUTH")) ?? "";
      const methods = auth.replace(/^AUTH[ =]/, "").split(/\s+/);
      const method = o.authMethod ?? (methods.includes("PLAIN") ? "PLAIN" : methods.includes("LOGIN") ? "LOGIN" : null);
      if (!method) throw new SmtpError(`The mail server offers no supported login method (${auth || "none"}).`, "AUTH");
      const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
      const authFail = (e: unknown) => {
        if (e instanceof SmtpError && e.code && e.code >= 500) throw new SmtpError(`Login to the mail server failed (${e.code}). Check SMTP_USER and SMTP_PASS — for Gmail use a 16-letter app password, not the account password.`, "AUTH", e.code, e.response);
        throw e;
      };
      try {
        if (method === "PLAIN") await c.command(`AUTH PLAIN ${b64(`\0${o.user}\0${o.pass}`)}`, [235], "AUTH PLAIN", "AUTH");
        else {
          await c.command("AUTH LOGIN", [334], "AUTH LOGIN");
          await c.command(b64(o.user), [334], "AUTH LOGIN username", "AUTH");
          await c.command(b64(o.pass), [235], "AUTH LOGIN password", "AUTH");
        }
      } catch (e) { authFail(e); }
    }
    await c.command(`MAIL FROM:<${from}>`, [250], "MAIL FROM");
    const accepted: string[] = [];
    for (const r of recipients) {
      await c.command(`RCPT TO:<${r}>`, [250, 251], `RCPT TO ${r}`);
      accepted.push(r);
    }
    await c.command("DATA", [354], "DATA");
    const { raw, messageId } = buildMessage(msg);
    c.write(dotStuff(raw));
    const done = await c.read("end of DATA");
    if (done.code !== 250) throw new SmtpError(`The mail server rejected the message: ${done.code} ${done.lines.join(" ")}`, "end of DATA", done.code, done.text);
    try { await c.command("QUIT", [221], "QUIT"); } catch { /* the message was accepted already */ }
    return { messageId, accepted, response: done.text };
  } finally {
    c.close();
  }
}
