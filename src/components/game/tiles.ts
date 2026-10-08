/** Kahoot-style answer tiles: a color and a shape for each choice (shapes help color-blind players). */
export const TILES = [
  { bg: "bg-red-500", ring: "ring-red-600", shape: "▲" },
  { bg: "bg-blue-500", ring: "ring-blue-600", shape: "◆" },
  { bg: "bg-amber-400", ring: "ring-amber-500", shape: "●" },
  { bg: "bg-emerald-500", ring: "ring-emerald-600", shape: "■" },
] as const;
