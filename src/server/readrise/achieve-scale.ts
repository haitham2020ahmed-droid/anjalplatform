/**
 * 📏 Round 8 (owner, 7 Nov 2026: "make ReadRise results very close to Achieve3000"): the Achieve3000 scale.
 *
 * How it was measured: 71 official Achieve3000 texts (11 lessons, each at all its Lexile levels, 130L…1440L) were
 * analysed; their Lexile is explained by sentence length and syllables per word
 *   Lexile ≈ −1252 + 799·ln(words per sentence) + 70.5·(syllables per word)   (error ±70 on their own texts).
 * The same formula on the ReadRise texts shows that a version labelled 800 reads like an Achieve3000 930L text, and
 * the placement passages read 60–190 above their labels. A student's LEVEL is now on the Achieve3000 scale:
 *   - the placement result is computed from each passage's measured Achieve level (PlacementPassage.lexile);
 *   - the version a student reads is the one whose Achieve level fits the student (ACHIEVE_OF_VERSION);
 *   - a version's "text ≈" level is shown on the same scale.
 * The version LABELS (300 … 1600, the article files) do not change. Pure functions only (no imports: level.ts uses it).
 */
/** The Achieve3000 level of each ReadRise version (the median of the 500 articles' versions, rounded to 10). */
export const ACHIEVE_OF_VERSION: Readonly<Record<number, number>> = {
  300: 200, 400: 390, 500: 550, 600: 700, 700: 800, 800: 930, 900: 1040, 1000: 1140,
  1100: 1240, 1200: 1330, 1300: 1410, 1400: 1500, 1500: 1590, 1600: 1780,
};

const POINTS: readonly (readonly [number, number])[] = Object.keys(ACHIEVE_OF_VERSION).map(Number).sort((a, b) => a - b).map((v) => [v, ACHIEVE_OF_VERSION[v]] as const);

/** Straight lines between the points; outside, the slope of the nearest end (1:1 at the ends). */
function interp(x: number, pts: readonly (readonly [number, number])[]): number {
  if (x <= pts[0][0]) return pts[0][1] + (x - pts[0][0]);
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1] + (x - last[0]);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (x <= x2) return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
  }
  return last[1];
}

/** A level on the ReadRise text scale (a version label or a text's estimate) → the Achieve3000 scale. */
export const toAchieve = (textLevel: number): number => Math.round(interp(Number(textLevel), POINTS));

/** A level on the Achieve3000 scale (a student's level) → the ReadRise text scale (to compare with version labels). */
export const toTextScale = (achieveLevel: number): number => Math.round(interp(Number(achieveLevel), POINTS.map(([a, b]) => [b, a] as const)));
