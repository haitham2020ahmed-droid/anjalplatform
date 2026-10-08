/**
 * Reading passages, parsed: paragraphs (blank lines between them, or a line of their own), section headings
 * written as “## Heading”, and text features written as “FIG: Diagram | Title | content”.
 */
export type PassageBlock = { kind: "h" | "p"; text: string } | { kind: "fig"; text: string; figKind: string; title: string };
/**
 * Text features written as “FIG: Diagram | Title | content” (also Map, Photo, Graph, Timeline, Sidebar, Chart,
 * Primary Source…) become a feature box — Analyze Craft questions ask about them.
 */
export function passageBlocks(text: string): PassageBlock[] {
  const out: PassageBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: "p", text: para.join("\n") }); para = []; } };
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = line.match(/^#{1,3}\s+(.+)$/);
    const fig = line.match(/^\s*FIG:\s*([^|]+)\|\s*([^|]*)\|\s*(.+)$/i);
    if (fig) { flush(); out.push({ kind: "fig", figKind: fig[1].trim(), title: fig[2].trim(), text: fig[3].trim() }); }
    else if (h) { flush(); out.push({ kind: "h", text: h[1].trim() }); }
    else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return out;
}

/** The passage without heading marks (for read-aloud): a feature is read as “Diagram: title. content”. */
export const plainPassage = (text: string) => String(text ?? "").replace(/^#{1,3}\s+/gm, "").replace(/^\s*FIG:\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(.+)$/gim, "$1: $2. $3").replace(/\s*→\s*/g, ", then ");
