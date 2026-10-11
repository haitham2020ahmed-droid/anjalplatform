/**
 * 📖 Prefill the school dictionaries (Update 42C): every word of every passage gets a meaning before a student taps it.
 *
 *   npx tsx scripts/vocab/prefill-dictionary.ts                 dry run: counts the missing words per school
 *   npx tsx scripts/vocab/prefill-dictionary.ts --apply         writes meanings with the school's AI (marked “AI · check”)
 *   options: --school=<id>  one school only · --limit=<n> at most n words per school (default 1500)
 *
 * Reads ReadRise versions, ReadMaster versions (also the fluency passages) and the question-bank passages page by
 * page (bounded memory), lemmatizes the words (stopped → stop), skips names (capitalized mid-sentence) and words
 * the school already knows, then asks the AI in batches of 30 words (word + passage sentence only; no student
 * data), within the school's AI settings (provider on/off, requests per minute and per day).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaRepo } from "../../src/server/db/prisma-repo";
import { aiEnv } from "../../src/server/ai/env";
import { prefill } from "../../src/server/vocabulary/prefill";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const prisma = new PrismaClient();
prefill(new PrismaRepo(prisma), aiEnv(), { apply: process.argv.includes("--apply"), school: arg("school"), limit: Math.max(1, Number(arg("limit") ?? 1500) || 1500) })
  .then((r) => console.log("done:", JSON.stringify(r)))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
