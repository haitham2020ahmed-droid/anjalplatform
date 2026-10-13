/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ReactNode } from "react";
import { CHOICE_LETTERS, formatSheetCode, stripBits, type SheetLayout } from "@/lib/omr/layout";

/**
 * One printable A4 bubble answer sheet (server-safe, no client code). The machine-readable parts (corner markers,
 * code strip, bubbles) are an SVG drawn in millimetres; the header text is HTML on top so names in any script
 * print with the page's fonts. Pure black on white: works on any black-and-white printer. Each sheet is one page.
 *
 * `labels` are the translated words (pass t("Name") etc. from the page); English is the default.
 */
export function AnswerSheet(props: {
  layout: SheetLayout;
  title: string;
  studentName?: string;
  className?: string;
  code: string;
  logo?: ReactNode;
  labels?: { name?: string; class?: string; code?: string; instruction?: string };
}) {
  const { layout, title, studentName, className, code, logo } = props;
  const L = {
    name: props.labels?.name ?? "Name",
    class: props.labels?.class ?? "Class",
    code: props.labels?.code ?? "Code",
    instruction: props.labels?.instruction ?? "Fill the circle completely with a dark pencil or pen",
  };
  const bits = stripBits(code, layout.questions);
  const box = layout.idBox;
  const mm = (v: number) => `${v}mm`;
  return (
    <section className="omr-sheet" style={{ position: "relative", width: "210mm", height: "297mm", background: "#fff", color: "#000", overflow: "hidden", margin: "0 auto" }}>
      <style>{PRINT_CSS}</style>
      <svg viewBox="0 0 210 297" width="210mm" height="297mm" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        {layout.markers.map((m, i) => <rect key={i} x={m.x} y={m.y} width={m.size} height={m.size} fill="#000" />)}
        {box ? <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={1.5} fill="none" stroke="#000" strokeWidth={0.3} /> : null}
        {layout.idBits.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={bits[i] ? "#000" : "#fff"} stroke="#000" strokeWidth={0.3} />
        ))}
        {layout.headers.map((h, i) => (
          <text key={i} x={h.x} y={h.y} fontSize={3.4} fontWeight={700} textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif">{CHOICE_LETTERS[h.choice]}</text>
        ))}
        {layout.labels.map((l) => (
          <text key={l.q} x={l.x} y={l.y} fontSize={3.4} fontWeight={700} textAnchor="end" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif">{l.q}</text>
        ))}
        {layout.bubbles.map((b) => (
          <g key={`${b.q}-${b.choice}`}>
            <circle cx={b.cx} cy={b.cy} r={b.r} fill="#fff" stroke="#000" strokeWidth={0.45} />
            <text x={b.cx} y={b.cy} fontSize={2.5} fill="#8a8a8a" textAnchor="middle" dominantBaseline="central" fontFamily="Arial, Helvetica, sans-serif">{CHOICE_LETTERS[b.choice]}</text>
          </g>
        ))}
      </svg>
      {logo ? <div style={{ position: "absolute", left: mm(24), top: mm(12), width: mm(16), height: mm(16), display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{logo}</div> : null}
      <div dir="auto" style={{ position: "absolute", left: mm(logo ? 44 : 24), top: mm(12), width: mm(logo ? 142 : 162), height: mm(9), fontSize: "5mm", fontWeight: 700, lineHeight: "9mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
      <div style={{ position: "absolute", left: mm(logo ? 44 : 24), top: mm(22), width: mm(logo ? 142 : 162), display: "flex", gap: "6mm", fontSize: "3.6mm", lineHeight: "7mm" }}>
        <span style={{ flex: 2, display: "flex", gap: "2mm", minWidth: 0 }}>
          <span>{L.name}:</span>
          <span dir="auto" style={{ flex: 1, borderBottom: "0.3mm solid #000", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>{studentName ?? ""}</span>
        </span>
        <span style={{ flex: 1, display: "flex", gap: "2mm", minWidth: 0 }}>
          <span>{L.class}:</span>
          <span dir="auto" style={{ flex: 1, borderBottom: "0.3mm solid #000", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden" }}>{className ?? ""}</span>
        </span>
      </div>
      {box ? (
        <div style={{ position: "absolute", left: mm(box.x + 2), top: mm(box.y), height: mm(box.h), width: mm(50), display: "flex", flexDirection: "column", justifyContent: "center", lineHeight: 1.15 }}>
          <span style={{ fontSize: "2.8mm" }}>{L.code}</span>
          <span style={{ fontSize: "5mm", fontWeight: 700, fontFamily: "'Courier New', Courier, monospace", letterSpacing: "0.4mm" }}>{formatSheetCode(code)}</span>
        </div>
      ) : null}
      <div dir="auto" style={{ position: "absolute", left: mm(24), top: mm(50.5), width: mm(162), fontSize: "3.4mm", fontWeight: 600, lineHeight: "6mm", textAlign: "center" }}>
        ● {L.instruction}
      </div>
    </section>
  );
}

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  .omr-sheet { margin: 0 !important; break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .omr-sheet:last-of-type { break-after: auto; page-break-after: auto; }
}
@media screen { .omr-sheet { box-shadow: 0 1px 6px rgba(0,0,0,.15); margin-bottom: 8mm !important; } }
`;
