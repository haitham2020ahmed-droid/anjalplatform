import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import type { SqliteRepo } from "../scripts/db/sqlite-repo";
import { resolveActor } from "../src/server/auth/actor";
import { ForbiddenError, type Actor } from "../src/server/auth/rbac";
import { inspectImage, readQuestionImage, saveQuestionImage } from "../src/server/admin/question-images";
import { getQuestion, listQuestions, updateDraft } from "../src/server/admin/questions";
import { deleteQuestions } from "../src/server/admin/question-delete";
import { loadSkillItems, toClientQuestion } from "../src/server/practice/items";
import { demoDatabase } from "./helpers/db";
import { publishGrade4Bank } from "./helpers/practice";

/** A real (tiny) PNG of the given size, so the decoder path is exercised end to end. */
function png(w: number, h: number, seed = 0): Uint8Array {
  const crc = (buf: Buffer) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, seed);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const jpeg = (w: number, h: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const gif = (w: number, h: number) => new Uint8Array([...Buffer.from("GIF89a"), w & 255, w >> 8, h & 255, h >> 8, 0, 0, 0, ...new Array(20).fill(0)]);
const webp = (w: number, h: number) => { const b = Buffer.alloc(30); b.write("RIFF", 0); b.write("WEBP", 8); b.write("VP8X", 12); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return new Uint8Array(b); };

describe("question images", () => {
  let repo: SqliteRepo;
  let admin: Actor, student: Actor;
  let qid: string, skillId: string;
  before(async () => {
    ({ repo } = await demoDatabase());
    await publishGrade4Bank(repo);
    admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
    student = await resolveActor(repo, (await repo.findMany("User", { role: "STUDENT" }))[0]);
    const q = (await repo.findMany("Question", { status: "PUBLISHED" })).find((x) => !x.passageId)!;
    qid = String(q.id); skillId = String(q.skillId);
  });

  test("real file types are recognised from their bytes; SVG and other files are refused", () => {
    assert.deepEqual(inspectImage(png(120, 80)), { mime: "image/png", width: 120, height: 80 });
    assert.deepEqual(inspectImage(jpeg(640, 480)), { mime: "image/jpeg", width: 640, height: 480 });
    assert.deepEqual(inspectImage(gif(32, 16)), { mime: "image/gif", width: 32, height: 16 });
    assert.deepEqual(inspectImage(webp(300, 200)), { mime: "image/webp", width: 300, height: 200 });
    assert.throws(() => inspectImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), /SVG images are not accepted/);
    assert.throws(() => inspectImage(new TextEncoder().encode("%PDF-1.7 this is not an image at all.")), /PNG, JPEG, WebP or GIF/);
    assert.throws(() => inspectImage(png(5000, 10)), /at most 4000 pixels/);
  });

  test("upload: stored once (duplicates share a row), size limit, permission", async () => {
    const a = await saveQuestionImage(repo, admin, png(60, 40, 7), "A chart");
    const b = await saveQuestionImage(repo, admin, png(60, 40, 7));
    assert.equal(a.id, b.id, "the same picture is stored once");
    const read = await readQuestionImage(repo, a.id);
    assert.equal(read!.mime, "image/png");
    assert.deepEqual(Buffer.from(read!.bytes), Buffer.from(png(60, 40, 7)), "bytes come back unchanged");
    await assert.rejects(saveQuestionImage(repo, admin, new Uint8Array(1_000_001)), /larger than 1 MB/);
    await assert.rejects(saveQuestionImage(repo, student, png(10, 10)), ForbiddenError);
  });

  test("editor: add, describe, replace (old one removed), remove; practice shows it", async () => {
    const first = await saveQuestionImage(repo, admin, png(50, 50, 1));
    const d = await getQuestion(repo, admin, qid);
    assert.equal(d.input.imageId, null, "optional: no image to start with");
    await updateDraft(repo, admin, qid, { ...d.input, imageId: first.id, imageAlt: "A map of the desert" });
    let item = (await loadSkillItems(repo, skillId)).find((i) => i.questionId === qid)!;
    assert.deepEqual(item.image, { id: first.id, alt: "A map of the desert" });
    const client = toClientQuestion(item, "seed");
    assert.deepEqual(client.image, { url: `/api/question-images/${first.id}`, alt: "A map of the desert" });
    assert.ok(!JSON.stringify(client).includes("bytes"), "the picture itself is not sent with the question");
    assert.ok((await listQuestions(repo, admin, { status: "PUBLISHED", image: "has" })).items.some((x) => x.id === qid && x.hasImage));
    const second = await saveQuestionImage(repo, admin, png(50, 50, 2));
    await updateDraft(repo, admin, qid, { ...(await getQuestion(repo, admin, qid)).input, imageId: second.id });
    assert.equal(await repo.findUnique("QuestionImage", { id: first.id }), null, "the replaced image is cleaned up");
    await updateDraft(repo, admin, qid, { ...(await getQuestion(repo, admin, qid)).input, imageId: null });
    assert.equal((await repo.findUnique("Question", { id: qid }))!.imageId, null);
    assert.equal(await repo.findUnique("QuestionImage", { id: second.id }), null);
    item = (await loadSkillItems(repo, skillId)).find((i) => i.questionId === qid)!;
    assert.equal(toClientQuestion(item, "s").image, null, "no image: the normal layout");
    await assert.rejects(updateDraft(repo, admin, qid, { ...(await getQuestion(repo, admin, qid)).input, imageId: "missing" }), /image was not found/);
  });

  test("deleting a question removes its image unless another question uses it", async () => {
    const shared = await saveQuestionImage(repo, admin, png(30, 30, 9));
    const [x, y] = (await repo.findMany("Question", { status: "PUBLISHED", skillId })).filter((q) => q.id !== qid).slice(0, 2).map((q) => String(q.id));
    for (const id of [x, y]) await updateDraft(repo, admin, id, { ...(await getQuestion(repo, admin, id)).input, imageId: shared.id });
    await deleteQuestions(repo, admin, [x]);
    assert.ok(await repo.findUnique("QuestionImage", { id: shared.id }), "still used by the other question");
    await deleteQuestions(repo, admin, [y]);
    assert.equal(await repo.findUnique("QuestionImage", { id: shared.id }), null);
  });
});
