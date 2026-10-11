/**
 * Several people's names on one line (readiness I-10). Each name is isolated with <bdi>, so an Arabic name never
 * swaps places with the score next to it or with the next name (an Arabic name, its score, the next Arabic name and its score stay in that order).
 */
export function NameList({ items, sep = " · " }: { items: { name: string; note?: string }[]; sep?: string }) {
  return <>{items.map((x, i) => <span key={i}>{i ? sep : ""}<bdi>{x.name}</bdi>{x.note ? ` ${x.note}` : ""}</span>)}</>;
}
