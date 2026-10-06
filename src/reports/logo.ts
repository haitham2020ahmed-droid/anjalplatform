/**
 * School logo for report headers, from School.logoUrl.
 *
 * Accepted:
 *   - a file name inside the branding folder (REPORT_BRANDING_DIR), e.g. "alanjal-logo.png"
 *   - a data URI: data:image/png;base64,...  (also jpeg, svg+xml)
 * Rejected (the report falls back to a text header, never fails):
 *   - http(s) and any other URL: fetching a stored URL from the server would let a
 *     changed setting make the server request internal addresses (SSRF), and remote
 *     images would make reports depend on another site being up
 *   - paths with folders or "..", files over 1 MB, content that is not really an image
 *   - SVG with scripts, event handlers or foreignObject
 */
import { readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Branding } from "./model";

export const MAX_LOGO_BYTES = 1_000_000;
type Logo = NonNullable<Branding["logo"]>;

export function sniffImage(b: Uint8Array): Logo["mime"] | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const head = Buffer.from(b.subarray(0, 2048)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

function svgIsSafe(b: Uint8Array): boolean {
  const s = Buffer.from(b).toString("utf8");
  return !/<script|<foreignObject|\son\w+\s*=|javascript:|<!ENTITY/i.test(s);
}

export function validateLogo(bytes: Uint8Array): { ok: true; logo: Logo } | { ok: false; reason: string } {
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return { ok: false, reason: "Logo must be between 1 byte and 1 MB." };
  const mime = sniffImage(bytes);
  if (!mime) return { ok: false, reason: "Logo must be a PNG, JPEG or SVG image." };
  if (mime === "image/svg+xml" && !svgIsSafe(bytes)) return { ok: false, reason: "SVG logo contains scripts or external content." };
  return { ok: true, logo: { mime, bytes } };
}

export function loadLogo(logoUrl: string | null | undefined, brandingDir: string): { logo: Logo | null; warning: string | null } {
  const v = (logoUrl ?? "").trim();
  if (!v) return { logo: null, warning: null };
  let bytes: Uint8Array;
  const data = /^data:image\/(png|jpeg|svg\+xml);base64,([A-Za-z0-9+/=\s]+)$/i.exec(v);
  if (data) {
    bytes = new Uint8Array(Buffer.from(data[2].replace(/\s/g, ""), "base64"));
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    return { logo: null, warning: "Remote logo URLs are not used in reports; upload the logo file to the branding folder." };
  } else {
    if (basename(v) !== v || v.startsWith(".")) return { logo: null, warning: "Logo must be a file name in the branding folder." };
    const dir = resolve(brandingDir);
    const file = resolve(join(dir, v));
    if (!file.startsWith(dir + "/") && !file.startsWith(dir + "\\")) return { logo: null, warning: "Logo must be a file name in the branding folder." };
    try {
      if (statSync(file).size > MAX_LOGO_BYTES) return { logo: null, warning: "Logo must be under 1 MB." };
      bytes = new Uint8Array(readFileSync(file));
    } catch {
      return { logo: null, warning: `Logo file "${v}" was not found in the branding folder.` };
    }
  }
  const r = validateLogo(bytes);
  return r.ok ? { logo: r.logo, warning: null } : { logo: null, warning: r.reason };
}
