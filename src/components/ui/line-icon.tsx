/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Clean line icons (24 × 24, 1.75 stroke, currentColor) for the staff and student menus, tiles and report cards: one calm set
 * instead of emojis. No client code: usable from server and client components. Decorative (aria-hidden): the label
 * next to each icon carries the meaning.
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  users: "M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 8v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z",
  plans: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Zm-3 2h12v14H6V6Zm3 6h6m-6 4h4",
  check: "M5 4h14v16H5V4Zm3.5 8 2.5 2.5L16 9.5",
  pen: "M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Zm9.5-12.5 3 3",
  book: "M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  chart: "M4 20h16M7 16v-5m5 5V7m5 9v-8",
  calendar: "M5 6h14v14H5V6Zm0 4h14M9 4v4m6-4v4",
  mail: "M4 6h16v12H4V6Zm0 0 8 7 8-7",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3h.01",
  week: "M5 6h14v14H5V6Zm0 4h14M9 4v4m6-4v4M8.5 14h2m3 0h2m-7 3h2",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  send: "M4 12 20 4l-6 16-3-7-7-1Z",
  print: "M7 9V4h10v5M7 17H5v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6h-2M7 14h10v6H7v-6Z",
  school: "M3 9 12 4l9 5-9 5-9-5Zm4 2.5V16c1.5 1.3 3 2 5 2s3.5-.7 5-2v-4.5",
  student: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  puzzle: "M10 4h4v3a1.5 1.5 0 1 0 3 0V4h3v6h-3a1.5 1.5 0 1 0 0 3h3v7h-6v-3a1.5 1.5 0 1 0-3 0v3H4v-7h3a1.5 1.5 0 1 0 0-3H4V4h6",
  family: "M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 2a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20v-1a5 5 0 0 1 10 0v1m1 0v-.5a4 4 0 0 1 7 0v.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  grid: "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z",
  growth: "M4 18 9.5 12.5l3.5 3.5L20 9m0 0h-5m5 0v5",
  alert: "M12 4 3 20h18L12 4Zm0 6v4m0 3h.01",
  file: "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6m-6 4h6",
  game: "M7 9h10a4 4 0 0 1 0 8c-1.3 0-2-.7-3-2h-4c-1 1.3-1.7 2-3 2a4 4 0 0 1 0-8Zm1 2.5v3m-1.5-1.5h3M16 12h.01M18 14h.01",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0m-6 6v3",
  star: "m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8L12 4Z",
  layers: "m12 4 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5",
  work: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M8.5 12l2 2 4-4M8.5 17h7",
  tests: "M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4h4M9 12h6M9 16h4",
  map: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01",
  curriculum: "M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13ZM6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2",
  retry: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  reading: "M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2ZM12 6.5v13",
  writing: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  words: "M6 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1ZM5 18a2 2 0 0 1 2-2h11M9 8h5",
  rise: "M5 20V14M10 20V10M15 20V7M20 20V4",
  learn: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3Z",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  chevron: "m9 6 6 6-6 6",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9Z",
  circle: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  half: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 4v16",
  play: "M8 5.5v13l10.5-6.5L8 5.5Z",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.5 14 7 21l5-3 5 3-1.5-7",
  chat: "M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5h4",
  ticket: "M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7ZM14 6v12",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4",
  tools: "M4 9h16v10H4V9Zm5 0V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M4 13h16m-9 0v2h2v-2",
  teacher: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M14 4h7v7h-4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.5a7.5 7.5 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2 1.2l.4 2.5h5l.4-2.5a7.5 7.5 0 0 0 2-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  scale: "M12 4v16M8 20h8M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0L5 7Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0L19 7Z",
  inbox: "M4 13V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5M4 13h4.5l1 2h5l1-2H20",
  building: "M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h3a1 1 0 0 1 1 1v10M3 21h18M8.5 8h3m-3 4h3m-3 4h3",
  sparkle: "M12 3c.6 4.2 2.3 6 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5C9.7 9 11.4 7.2 12 3ZM18.5 15c.3 1.8 1 2.6 2.5 3-1.5.3-2.2 1.1-2.5 3-.3-1.9-1-2.7-2.5-3 1.5-.4 2.2-1.2 2.5-3Z",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10ZM7.5 12h2.5l1.2-2 1.6 4 1.2-2h2.5",
  broom: "M14.5 3.5 11 10m-2.5-1.5 7 4L13 20H5l1-6.5 2.5-5ZM9 20l1-4m3 4 .5-2.5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  x: "m6 6 12 12M18 6 6 18",
  archive: "M4 5h16v4H4V5Zm1 4v10h14V9M10 13h4",
  qr: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h2v2h-2v-2Zm4 0h2m-2 4h2v2m-6 0h2M6.5 6.5h1m9 0h1m-11 10h1",
} as const;

export type LineIconName = keyof typeof PATHS;
export const LINE_ICONS = Object.keys(PATHS) as LineIconName[];
export const isLineIcon = (v: unknown): v is LineIconName => typeof v === "string" && v in PATHS;

export function LineIcon({ name, className = "h-5 w-5", strokeWidth = 1.75 }: { name: LineIconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
