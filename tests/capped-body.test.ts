/**
 * 🛟 r89 (server-stability audit): withCappedBody enforces a real byte limit on the actual stream, independent of
 * the client-supplied Content-Length header — a route must not trust that header alone before buffering a body.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { withCappedBody, BodyTooLargeError } from "../src/server/lib/capped-body";

function multipartBody(boundary: string, fieldName: string, fileName: string, content: string): Uint8Array {
  const text = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  return new TextEncoder().encode(text);
}
function streamOf(bytes: Uint8Array, chunkSize = 5): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(i, i + chunkSize));
      i += chunkSize;
    },
  });
}
function requestWithBody(bytes: Uint8Array, boundary: string): Request {
  return new Request("http://x.test/upload", { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body: streamOf(bytes), duplex: "half" } as RequestInit);
}

describe("withCappedBody: a real byte cap, not just the (client-supplied) Content-Length header", () => {
  test("a body within the limit reads normally", async () => {
    const boundary = "cap-test-1";
    const bytes = multipartBody(boundary, "file", "a.txt", "hello world");
    const req = withCappedBody(requestWithBody(bytes, boundary), 1_000_000);
    const form = await req.formData();
    const file = form.get("file") as File;
    assert.equal(file.name, "a.txt");
    assert.equal(await file.text(), "hello world");
  });

  test("a body over the limit is rejected even though nothing claimed a Content-Length at all", async () => {
    const boundary = "cap-test-2";
    const bytes = multipartBody(boundary, "file", "big.txt", "x".repeat(1000));
    const req = withCappedBody(requestWithBody(bytes, boundary), 50); // far smaller than the real body
    await assert.rejects(() => req.formData(), BodyTooLargeError);
  });

  test("a request with no body (e.g. GET) is returned unchanged", () => {
    const req = new Request("http://x.test/", { method: "GET" });
    const wrapped = withCappedBody(req, 10);
    assert.equal(wrapped, req);
  });
});
