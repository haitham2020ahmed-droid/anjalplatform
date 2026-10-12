/**
 * HTML → PDF with headless Chromium (playwright-core).
 *
 * Why a browser engine: Arabic needs contextual shaping (joined letters, lam-alef),
 * the Unicode bidirectional algorithm for mixed Arabic/English lines, and right-to-
 * left table layout. Chromium does all three correctly (HarfBuzz + ICU). PDF
 * libraries that draw text themselves (pdf-lib, pdfkit, @react-pdf) either do not
 * shape Arabic or do it partially, which produces disconnected or reversed letters.
 *
 * Safety: the HTML is our own escaped template, but it contains user-entered names,
 * so the page is still treated as untrusted. JavaScript is disabled and every
 * network request is aborted, so nothing in a report can run code or fetch/leak data.
 * Fonts and the logo are embedded as data: URIs and need no requests.
 *
 * Resource limits: one shared browser per process, at most `concurrency` pages at a
 * time (others wait up to `queueTimeoutMs`), and a per-render timeout.
 */
import type { ReportDoc } from "./model";
import { footerTemplate } from "./html";

export interface PdfRenderer {
  /** opts.footer false: no page-number footer (a one-page certificate) */
  render(html: string, doc: ReportDoc, fontStack: string, opts?: { footer?: boolean }): Promise<Uint8Array>;
  close(): Promise<void>;
}

export class ReportBusyError extends Error {
  readonly status = 503;
  constructor() {
    super("The report service is busy. Please try again in a minute.");
  }
}

export interface ChromiumOptions {
  executablePath?: string;
  concurrency?: number;
  renderTimeoutMs?: number;
  queueTimeoutMs?: number;
  /** Extra Chromium flags, e.g. ["--no-sandbox"] when the container cannot provide a sandbox. */
  args?: string[];
  /**
   * Close Chromium after this long without a render (default 60 s; 0 = keep it open). A headless Chromium holds
   * 100+ MB of the server's memory (512 MB plan) even when idle; it starts again in about a second on the next PDF.
   */
  idleCloseMs?: number;
}

/** Minimal counting semaphore with a wait timeout. */
export class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(timeoutMs: number): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        this.active++;
        resolve(() => this.release());
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== grant);
        reject(new ReportBusyError());
      }, timeoutMs);
      this.waiters.push(grant);
    });
  }
  private release() {
    this.active--;
    this.waiters.shift()?.();
  }
  get inUse() {
    return this.active;
  }
}

type Browser = import("playwright-core").Browser;

export function chromiumRenderer(opts: ChromiumOptions = {}): PdfRenderer {
  const gate = new Semaphore(opts.concurrency ?? 2);
  let browser: Promise<Browser> | null = null;
  const idleMs = opts.idleCloseMs ?? 60_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const stopIdle = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } };
  const closeBrowser = async () => {
    stopIdle();
    const old = browser;
    browser = null; // a render starting now launches a new one instead of using the closing one
    if (old) {
      const b = await old.catch(() => null);
      await b?.close().catch(() => undefined);
    }
  };
  /** after the last render: close the idle browser later (a render that starts meanwhile cancels it) */
  const armIdle = () => {
    if (!idleMs || gate.inUse > 0 || !browser) return;
    stopIdle();
    idleTimer = setTimeout(() => { idleTimer = null; if (gate.inUse === 0) void closeBrowser(); }, idleMs);
    (idleTimer as { unref?: () => void }).unref?.();
  };

  const getBrowser = async (): Promise<Browser> => {
    if (browser) {
      const b = await browser.catch(() => null);
      if (b && b.isConnected()) return b;
    }
    browser = (async () => {
      const { chromium } = await import(/* webpackIgnore: true */ "playwright-core"); // loaded on the first PDF only (Update 42A)
      return chromium.launch({
        executablePath: opts.executablePath || undefined,
        args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions", ...(opts.args ?? [])],
      });
    })();
    return browser;
  };

  return {
    async render(html, doc, fontStack, ropts) {
      const release = await gate.acquire(opts.queueTimeoutMs ?? 30_000);
      stopIdle();
      let b: Browser;
      try { b = await getBrowser(); } catch (e) { release(); armIdle(); throw e; }
      const ctx = await b.newContext({ javaScriptEnabled: false, offline: true, locale: doc.locale === "ar" ? "ar-SA" : "en-GB" });
      try {
        await ctx.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort("blockedbyclient")));
        const page = await ctx.newPage();
        const timeout = opts.renderTimeoutMs ?? 20_000;
        page.setDefaultTimeout(timeout);
        await page.setContent(html, { waitUntil: "load", timeout });
        await page.emulateMedia({ media: "print" });
        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: ropts?.footer !== false,
          headerTemplate: "<span></span>",
          footerTemplate: footerTemplate(doc, fontStack),
          tagged: true,
          outline: false,
        });
        return new Uint8Array(pdf);
      } finally {
        await ctx.close().catch(() => undefined);
        release();
        armIdle();
      }
    },
    async close() {
      await closeBrowser();
    },
  };
}
