/**
 * 🔊 Pre-generate natural read-aloud audio (UI reorg Phase 6) for passages, questions and ReadMaster articles.
 *
 *   npx tsx scripts/tts/pregenerate.ts                  dry run: counts texts and characters, estimates the cost
 *   npx tsx scripts/tts/pregenerate.ts --apply          makes the missing audio (resumable: run again to continue)
 *   options: --only=passages,questions,readmaster,readrise · --limit=<n> new files this run (default 500)
 *            --readrise  also the ReadRise articles (every level version; opt-in: many long texts)
 *            --rpm=<n> provider requests per minute (default TTS_REQUESTS_PER_MINUTE or 30)
 *            --replace-voice  also remake audio made with another voice (after changing the voice)
 *
 * Provider and keys from the environment (TTS_PROVIDER=google|gemini, GOOGLE_TTS_API_KEY / GEMINI_API_KEY, …): see
 * docs/READ_ALOUD.md. Only the texts are sent (no student data). Audio is stored in the database (TtsAudio).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { ttsEnv } from "../../src/server/tts/env";
import { ALL_TTS_SOURCES, pregenerate, TTS_SOURCES, type TtsSource } from "../../src/server/tts/pregenerate";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const picked = arg("only")?.split(",").map((s) => s.trim()).filter((s): s is TtsSource => (ALL_TTS_SOURCES as string[]).includes(s));
const withReadRise = process.argv.includes("--readrise");
const only = withReadRise ? [...new Set([...(picked?.length ? picked : TTS_SOURCES), "readrise" as const])] : picked;
const prisma = new PrismaClient();
pregenerate(new PrismaRepo(prisma), ttsEnv(), {
  apply: process.argv.includes("--apply"),
  only,
  limit: Number(arg("limit")) || undefined,
  rpm: Number(arg("rpm")) || undefined,
  replaceVoice: process.argv.includes("--replace-voice"),
})
  .then((r) => console.log("done:", JSON.stringify(r)))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
