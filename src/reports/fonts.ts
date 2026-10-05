/**
 * Report fonts, embedded into the HTML as data URIs so a PDF looks the same on
 * every server and never depends on fonts installed on the host.
 *
 * Bundled (assets/fonts/): DejaVu Sans regular + bold — free licence
 * (LICENSE-DejaVu.txt), full Arabic and Latin coverage. Always available.
 *
 * Optional upgrade: drop these files into the same folder and they are used
 * automatically, Arabic first (both are SIL Open Font Licence):
 *   NotoNaskhArabic-Regular.ttf, NotoNaskhArabic-Bold.ttf   (Arabic text)
 *   NotoSans-Regular.ttf,        NotoSans-Bold.ttf           (Latin text)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Face {
  family: string;
  file: string;
  weight: 400 | 700;
  /** Restrict a face to a script so the right font draws each character. */
  range?: string;
}

const ARABIC_RANGE = "U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F, U+061C";

const CANDIDATES: Face[] = [
  { family: "Report Arabic", file: "NotoNaskhArabic-Regular.ttf", weight: 400, range: ARABIC_RANGE },
  { family: "Report Arabic", file: "NotoNaskhArabic-Bold.ttf", weight: 700, range: ARABIC_RANGE },
  { family: "Report Latin", file: "NotoSans-Regular.ttf", weight: 400 },
  { family: "Report Latin", file: "NotoSans-Bold.ttf", weight: 700 },
  { family: "Report Base", file: "DejaVuSans.ttf", weight: 400 },
  { family: "Report Base", file: "DejaVuSans-Bold.ttf", weight: 700 },
];

export interface FontSet {
  css: string;
  stack: string;
  families: string[];
}

const cache = new Map<string, FontSet>();

export function loadFonts(dir: string): FontSet {
  const hit = cache.get(dir);
  if (hit) return hit;
  const present = CANDIDATES.filter((f) => existsSync(join(dir, f.file)));
  if (!present.some((f) => f.family === "Report Base")) {
    throw new Error(`Report fonts are missing: expected DejaVuSans.ttf in ${dir}.`);
  }
  const css = present
    .map((f) => {
      const b64 = readFileSync(join(dir, f.file)).toString("base64");
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;src:url(data:font/ttf;base64,${b64}) format("truetype");${f.range ? `unicode-range:${f.range};` : ""}}`;
    })
    .join("\n");
  const families = [...new Set(present.map((f) => f.family))];
  // Arabic face first: it only covers Arabic code points, so Latin falls through to the next face.
  const order = ["Report Arabic", "Report Latin", "Report Base"].filter((f) => families.includes(f));
  const set = { css, stack: [...order.map((f) => `"${f}"`), "sans-serif"].join(", "), families };
  cache.set(dir, set);
  return set;
}
