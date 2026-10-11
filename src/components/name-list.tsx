/**
 * Several people's names on one line (readiness I-10). Each name is isolated with <bdi>, so an Arabic name never
 * swaps places with the score next to it or with the next name ("بدر (100) · دانة (85)" stays in that order).
 */
export function NameList({ items, sep = " · " }: { items: { name: string; note?: string }[]; sep?: string }) {
  return <>{items.map((x, i) => <span key={i}>{i ? sep : ""}<bdi>{x.name}</bdi>{x.note ? ` ${x.note}` : ""}</span>)}</>;
}
