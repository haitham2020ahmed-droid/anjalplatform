/**
 * Optional question images (diagram, chart, map, picture, graphic organizer).
 *
 * Stored in the database (QuestionImage) because the web server's disk is not persistent on the
 * hosting plan. The browser resizes images before upload; the server checks the real file type from
 * its bytes (PNG, JPEG, WebP, GIF; never SVG, which can carry scripts), the size (≤ 1 MB) and the
 * dimensions. The same image uploaded twice is stored once.
 */
import { createHash } from "node:crypto";
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

export const MAX_IMAGE_BYTES = 1_000_000;
export const MAX_IMAGE_SIDE = 4000;
export type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Reads the type and size of an image from its bytes. Throws ValidationError for anything else. */
export function inspectImage(b: Uint8Array): { mime: ImageMime; width: number; height: number } {
  if (b.length < 24) throw new ValidationError("This file is not an image.");
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  let r: { mime: ImageMime; width: number; height: number } | null = null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) r = { mime: "image/png", width: u32be(16), height: u32be(20) };
  else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) r = { mime: "image/gif", width: u16le(6), height: u16le(8) };
  else if (b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: walk the segments to the frame header (SOF0–SOF15, except DHT/JPG/DAC)
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) { r = { mime: "image/jpeg", width: u16be(i + 7), height: u16be(i + 5) }; break; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      i += 2 + u16be(i + 2);
    }
    if (!r) throw new ValidationError("This JPEG image could not be read. Save it again and retry.");
  } else if (String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...b.subarray(12, 16));
    if (kind === "VP8X") r = { mime: "image/webp", width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    else if (kind === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); r = { mime: "image/webp", width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
    else if (kind === "VP8 ") r = { mime: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
  } else if (/^\s*<(\?xml|svg)/i.test(new TextDecoder().decode(b.subarray(0, 100)))) {
    throw new ValidationError("SVG images are not accepted (they can contain scripts). Export the picture as PNG or JPEG.");
  }
  if (!r) throw new ValidationError("Use a PNG, JPEG, WebP or GIF image.");
  if (!r.width || !r.height || r.width > MAX_IMAGE_SIDE || r.height > MAX_IMAGE_SIDE) throw new ValidationError(`The image must be at most ${MAX_IMAGE_SIDE} pixels on each side.`);
  return r;
}

/** Stores an image (or finds the identical one) and returns its id. */
export async function saveQuestionImage(repo: Repo, actor: Actor, bytes: Uint8Array, altText?: string | null, now = new Date()): Promise<{ id: string; width: number; height: number; size: number }> {
  assertCan(actor, "questions:edit");
  if (!bytes.length) throw new ValidationError("Choose an image.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ValidationError("The image is larger than 1 MB. Use a smaller image.");
  const info = inspectImage(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const alt = cleanAlt(altText);
  const same = (await repo.findMany("QuestionImage", { sha256 }, { select: ["id", "size", "altText"] })).find((x) => Number(x.size) === bytes.length);
  if (same) {
    if (alt && !same.altText) await repo.updateMany("QuestionImage", { id: same.id }, { altText: alt });
    return { id: String(same.id), width: info.width, height: info.height, size: bytes.length };
  }
  const row = await repo.create("QuestionImage", { mime: info.mime, bytes: Buffer.from(bytes), size: bytes.length, width: info.width, height: info.height, sha256, altText: alt, createdById: actor.userId, createdAt: now });
  return { id: String(row.id), width: info.width, height: info.height, size: bytes.length };
}

export function cleanAlt(v: string | null | undefined): string | null {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  if (t.length > 300) throw new ValidationError("Keep the image description under 300 characters.");
  return t || null;
}

/**
 * The bytes to send to the browser. With `schoolId` (always passed by the HTTP route),
 * only an image used by a question of that school, or uploaded by a user of that
 * school, is returned; anything else is "not found". Images are de-duplicated by
 * content across schools, so either link proves the school may see these bytes.
 */
export async function readQuestionImage(repo: Repo, id: string, schoolId?: string | null): Promise<{ mime: string; bytes: Uint8Array } | null> {
  const row = await repo.findUnique("QuestionImage", { id });
  if (!row) return null;
  if (schoolId !== undefined && !(await imageVisibleToSchool(repo, row, schoolId))) return null;
  const b = row.bytes as Uint8Array | string;
  return { mime: String(row.mime), bytes: typeof b === "string" ? Buffer.from(b, "base64") : b };
}

async function imageVisibleToSchool(repo: Repo, img: Record<string, unknown>, schoolId: string | null): Promise<boolean> {
  if (!schoolId) return false;
  if (img.createdById) {
    const u = await repo.findUnique("User", { id: String(img.createdById) });
    if (u && String(u.schoolId ?? "") === schoolId) return true;
  }
  const qs = await repo.findMany("Question", { imageId: String(img.id) }, { select: ["skillId"] });
  if (!qs.length) return false;
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => String(q.skillId)))] } }, { select: ["curriculumId"] });
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => String(k.curriculumId)))] } }, { select: ["gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => String(c.gradeId)))] } }, { select: ["schoolId"] }) : [];
  return grades.some((g) => String(g.schoolId) === schoolId);
}

/** Deletes images that no question uses any more (after a replace or remove). */
export async function removeUnusedImages(repo: Repo, ids: (string | null | undefined)[]): Promise<void> {
  const list = [...new Set(ids.filter(Boolean).map(String))];
  if (!list.length) return;
  const used = new Set((await repo.findMany("Question", { imageId: { in: list } }, { select: ["imageId"] })).map((q) => String(q.imageId)));
  const orphan = list.filter((i) => !used.has(i));
  if (orphan.length) await repo.deleteMany("QuestionImage", { id: { in: orphan } });
}
