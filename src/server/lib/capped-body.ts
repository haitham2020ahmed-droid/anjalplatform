/**
 * 🛟 r89 (server-stability audit, Oct 2026): every upload route here checks the request's declared `Content-Length`
 * header before reading the body — but that header is supplied by the CLIENT and is not enforced by anything: a
 * request that lies about its size (or a buggy client/proxy) still has its *entire* body read and buffered in
 * memory by `req.formData()` before the real, server-measured `file.size` is ever checked. On a 512 MB instance, one
 * or two such uploads landing at once could exhaust memory before the size check that was supposed to stop them
 * even runs.
 *
 * `withCappedBody` enforces the limit on the ACTUAL bytes as they stream in, independent of what the client claims:
 * once more than `maxBytes` have been read, the stream errors out and `.formData()` rejects with `BodyTooLargeError`
 * instead of finishing the buffer. Routes catch that error the same way they already handle an oversized upload.
 */
export class BodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeded ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/** Wraps a Request so its body stream self-aborts once more than `maxBytes` have actually been read. */
export function withCappedBody(req: Request, maxBytes: number): Request {
  if (!req.body) return req;
  let total = 0;
  const capped = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) { controller.error(new BodyTooLargeError(maxBytes)); return; }
      controller.enqueue(chunk);
    },
  }));
  // duplex: "half" is required by the Fetch spec whenever a Request is constructed with a streaming body
  return new Request(req.url, { method: req.method, headers: req.headers, body: capped, duplex: "half" } as RequestInit);
}
