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
  render(html: string, doc: ReportDoc, fontStack: string): Promise<Uint8Array>;
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

  const getBrowser = async (): Promise<Browser> => {
    if (browser) {
      const b = await browser.catch(() => null);
      if (b && b.isConnected()) return b;
    }
    browser = (async () => {
      const { chromium } = await import("playwright-core");
      return chromium.launch({
        executablePath: opts.executablePath || undefined,
        args: ["--disable-dev-shm-usage", "--no-first-run", "--disable-extensions", ...(opts.args ?? [])],
      });
    })();
    return browser;
  };

  return {
    async render(html, doc, fontStack) {
      const release = await gate.acquire(opts.queueTimeoutMs ?? 30_000);
      const b = await getBrowser();
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
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: footerTemplate(doc, fontStack),
          tagged: true,
          outline: false,
        });
        return new Uint8Array(pdf);
      } finally {
        await ctx.close().catch(() => undefined);
        release();
      }
    },
    async close() {
      if (browser) {
        const b = await browser.catch(() => null);
        browser = null;
        await b?.close().catch(() => undefined);
      }
    },
  };
}
