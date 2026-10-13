/**
 * The English UI words of the bubble-sheet components (each has an Arabic translation in src/i18n/ar.ts).
 * A server page builds the scanner's labels with: Object.fromEntries(OMR_SCANNER_LABELS.map((k) => [k, t(k)])).
 */
export const OMR_SCANNER_LABELS = [
  "Use camera",
  "Take photo",
  "Stop camera",
  "Choose images",
  "Reading sheets…",
  "Line up the four black corner squares inside the frame",
  "Camera not available. Choose images instead.",
  "Scanned PDF? Save its pages as images (JPG or PNG) and choose them here.",
  "Photos are read on this device and are never uploaded.",
  "Could not open this image",
] as const;

/** Words printed on the answer sheet: AnswerSheet labels={{ name: t("Name"), class: t("Class"), code: t("Code"), instruction: t(OMR_INSTRUCTION) }}. */
export const OMR_SHEET_LABELS = ["Name", "Class", "Code", "Fill the circle completely with a dark pencil or pen"] as const;
export const OMR_INSTRUCTION = "Fill the circle completely with a dark pencil or pen";
