/**
 * 🧹 Clears cached natural read-aloud audio (TtsAudio). One-off, by hand only.
 *
 * Why this exists: audio lookups (src/server/tts/store.ts#findAudioMeta, used by /api/tts/[key]) match purely
 * by a hash of the text — they never check the current TTS_PROVIDER. So after removing TTS_PROVIDER (to fall
 * back to the device's own voice, for perfect word-by-word sync), any passage/question already played before
 * keeps serving its OLD cached Gemini/Google audio forever — the student never actually hears the device voice
 * for that text. This script deletes the cached rows so every text falls through to the device voice again.
 * Safe either way: if TTS_PROVIDER is set later, the cache simply refills itself as things are replayed/pre-generated.
 *
 *   npx tsx scripts/tts/clear-audio.ts            dry run: counts rows, no changes
 *   npx tsx scripts/tts/clear-audio.ts --apply    deletes all cached audio rows
 *   npx tsx scripts/tts/clear-audio.ts --apply --source=readrise   only rows whose `source` starts with "readrise"
 *                                                   (use this to leave questions/passages audio alone and clear
 *                                                   only the ReadRise article narration)
 */
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const sourcePrefix = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];

const prisma = new PrismaClient();
(async () => {
  const where = sourcePrefix ? { source: { startsWith: sourcePrefix } } : {};
  const count = await prisma.ttsAudio.count({ where });
  console.log(`${count} cached audio row(s) match${sourcePrefix ? ` (source starting with "${sourcePrefix}")` : ""}.`);
  if (!apply) {
    console.log("Dry run only — nothing deleted. Re-run with --apply to actually delete.");
    return;
  }
  const r = await prisma.ttsAudio.deleteMany({ where });
  console.log(`Deleted ${r.count} row(s).`);
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
