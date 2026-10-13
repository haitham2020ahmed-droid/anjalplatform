/** Web Worker: reads one sheet off the main thread. Message in: { id, img, layout }; out: { id, result } or { id, error }. */
import { readSheet } from "./read";
import type { SheetLayout } from "./layout";

const ctx = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown, transfer?: Transferable[]) => void };

ctx.onmessage = (e: MessageEvent) => {
  const { id, img, layout } = e.data as { id: number; img: ImageData; layout: SheetLayout };
  try {
    const result = readSheet(img, layout);
    ctx.postMessage({ id, result }, result.warped ? [result.warped.data.buffer] : []);
  } catch (err) {
    ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
