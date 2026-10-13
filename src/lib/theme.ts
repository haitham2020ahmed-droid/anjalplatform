/**
 * Day / Night look (no React, no server-only code: the layout, the shell and the top-bar switch share it).
 * DAY is the default. NIGHT only when the user picks it; SYSTEM follows the device (prefers-color-scheme).
 * The choice lives in the `lr-theme` cookie on this device; the server reads it and writes <html data-theme>, so the
 * first paint already has the right colours (no flash). The colours themselves: src/app/globals.css + night.css.
 */
export const THEME_COOKIE = "lr-theme";
export const THEMES = ["day", "night", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);
/** Unknown or missing → the day look. */
export const toTheme = (v: unknown): Theme => (isTheme(v) ? v : "day");
/** The cookie the switch writes (one year, the whole site, readable by the server on the next request). */
export const themeCookie = (t: Theme, secure = false) => `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
