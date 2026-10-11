# Read-aloud: natural voice (UI reorg Phase 6)

Every 🔊 **Listen** button (practice, quizzes, skill games, lessons, ReadMaster, Respond to Reading) uses the same
player, `src/components/listen-button.tsx`. It works like this:

1. If audio was **pre-generated** for the text, it plays that natural voice.
2. Otherwise it uses the **most natural American English voice on the device**. The student can choose another
   voice from the "Follow along" box.
3. **Slow / Normal** speed. The choice is remembered on the device, and ReadMaster starts on Slow for students
   reading Below level.
4. **Follow along**: each word is highlighted as it is read.

Only passage and question text is ever sent to a voice service. Students' names, ids and answers are never sent.
The Fluency Coach recording works as before.

## Turn on the natural voice (Google Cloud Text-to-Speech, recommended)

1. In Google Cloud Console, create a project, enable the **Cloud Text-to-Speech API**, and create an **API key**
   restricted to that API. Chirp 3 HD and Neural2 each include 1M free characters a month, and the whole question
   bank is about 235K characters.
2. Set these on Render (Environment) or in `.env`:

   | Variable | Value |
   |---|---|
   | `TTS_PROVIDER` | `google` (or `gemini`; empty = device voices only) |
   | `GOOGLE_TTS_API_KEY` | the API key |
   | `GOOGLE_TTS_VOICE` | optional. Default `en-US-Chirp3-HD-Leda` (most natural). `en-US-Neural2-F` gives exact word highlighting |
   | `TTS_SPEAKING_RATE` | optional, default `0.95` |
   | `TTS_REQUESTS_PER_MINUTE` | optional, default `30` |
   | Gemini instead: `GEMINI_API_KEY` (already set), `GEMINI_TTS_MODEL` (default `gemini-2.5-flash-preview-tts`), `GEMINI_TTS_VOICE` (default `Kore`), `GEMINI_TTS_STYLE` | |

3. Once, add the new table with `npx prisma db push`. This is additive: it only adds `TtsAudio`.
4. From the Render Shell (or any computer that has `DATABASE_URL`), run:

   ```sh
   npx tsx scripts/tts/pregenerate.ts            # dry run: what would be made, characters, estimated cost
   npx tsx scripts/tts/pregenerate.ts --apply    # make the audio (500 files per run; run again to continue)
   ```

   Options: `--only=passages,questions,readmaster`, `--limit=<n>`, `--rpm=<n>`, `--replace-voice` (remakes the audio
   after you change the voice). Run it again after importing new questions or articles. Texts that already have
   audio are skipped.

## Where the audio is stored, and why

The audio goes in the **database**, in the `TtsAudio` table (MEDIUMBLOB, one row per spoken text, keyed by the
SHA-256 of the text):

- Render's disk is wiped on every deploy, and the plan has no object storage. The database survives deploys and is
  already backed up (Aiven daily backups). It is the same choice as the question images and reading recordings.
- A static folder committed to git would bloat the repository, would need a rebuild for every new question, and
  cannot hold audio for questions the school writes itself.
- An external bucket (Cloudflare R2, Google Cloud Storage) would be another account and another key. It is worth
  moving to one if the audio grows beyond a few hundred MB.
- Size: about 65 MB of MP3 for the whole bank with Google. Gemini's WAV is about 8 times bigger.
- Audio is served by `GET /api/tts/<hash>` (signed-in users only, Range requests for iPhone/iPad, long private
  caching). If the text changes, its hash changes too, so old audio is never played for new text.

ReadRise: `npx tsx scripts/tts/pregenerate.ts --readrise [--apply]` also makes the audio of every level version of
the published ReadRise articles (opt-in: many long texts). When an article's audio exists, the ReadRise reader shows
the shared player (natural voice, Slow / Normal, Follow along); otherwise it keeps its own sentence-by-sentence
device voice with the highlighting in the text.

## Voice options compared (October 2026)

"One-time" is the cost to pre-generate the ≈235,000 bank characters. "Monthly" assumes about 100,000 new characters a month.

| Option | Quality (natural?) | US accent | Price per 1M characters | Free tier | One-time (bank) | Monthly | Word timings for highlighting | Privacy / data |
|---|---|---|---|---|---|---|---|---|
| **Google Cloud TTS: Chirp 3 HD** ✅ | Very natural (LLM-based) | Yes (en-US, 30 voices) | $30 | 1M characters a month | **$0** | **$0** | Estimated sentence by sentence (no `<mark>` support) | Cloud terms: your data is not used to train models |
| Google Cloud TTS: Neural2 | Natural, slightly "announcer" | Yes | $16 | 1M a month | $0 | $0 | **Exact** (SSML `<mark>` timepoints; marks are not billed) | Same as above |
| Google Cloud TTS: Studio | Very natural, narration style | Yes (few voices) | $160 | 1M a month | $0 | $0 | Exact | Same as above |
| Gemini API TTS (the school's existing key): 2.5 Flash / 3.8 Flash(-Lite) TTS | Very natural, can be told how to read | Yes | Billed per token, about $17 (2.5 Flash), $16 (3.8 Flash, $32 from 2027) or $10 (3.8 Flash-Lite, $20 from 2027)¹ | Free tier with low rate limits; **free-tier content "used to improve products"** | $0 free tier, or ≈ $2–4 paid | ≈ $1–2 | Estimated only | Paid tier: not used. Text only, never student data |
| Azure AI Speech: Neural (Ava, Jenny, Andrew…) / HD | Very natural | Yes | $15–16 (Neural), $22 (HD) | 0.5M a month (F0) | $0 | $0 | Exact (word boundary events) | Not used for training |
| Amazon Polly: Neural / Generative | Good (Neural), very natural (Generative) | Yes | $16 / $30 | 1M Neural or 100K Generative a month, for 12 months only | $0 / ≈ $4 | $0 / ≈ $3 | Exact (speech marks) | Check the AWS AI-services opt-out |
| OpenAI: tts-1 / tts-1-hd / gpt-4o-mini-tts | Natural, slightly "assistant" | Yes (neutral US) | $15 / $30 / about $0.015 a minute | $5 starter credit only | ≈ $4–7 | ≈ $2–3 | None (estimated) | API data is not used for training by default |
| ElevenLabs: Flash / Multilingual v2–v3 | Most expressive | Yes | $50 / $100 | 10K a month, **no commercial use** | ≈ $12–24 (Pro plan $99 a month) | $22+ a month plan | Yes (character timestamps) | Commercial plan needed |
| **Free fallback: device voices** | Edge "Natural" voices and Apple Premium voices: good. Chrome "Google US English": fair. Others: robotic | Yes | $0 | — | $0 | $0 | Word events (Edge, Safari), estimated (Chrome) | Nothing leaves the device |

¹ Gemini bills audio at 25 tokens per second. 1M characters is about 66,700 seconds, or about 1.67M audio tokens, plus about 0.25M text tokens. Gemini returns raw PCM, so the platform stores it as 16 kHz WAV, about **8 times larger** than Google's MP3. For the bank that is about 500 MB in the database, compared with about 65 MB of MP3.

## Recommendation

**Use Google Cloud Text-to-Speech with the Chirp 3 HD voice `en-US-Chirp3-HD-Leda`** (you can switch to another Chirp 3 HD voice, such as `Aoede`, `Achird` or `Sulafat`, with one setting).

- It is the most natural American voice that costs **$0 at our volume**: 1M free characters a month, compared with ≈ 235K for the whole bank today.
- It returns small MP3 files (≈ 65 MB for the bank), which fit in the database.
- Word highlighting is estimated sentence by sentence, which is good enough for following along. If you want **exact** highlighting, set `GOOGLE_TTS_VOICE=en-US-Neural2-F`, which is also free at our volume.
- Gemini works with the key you already have, but its files are 8 times bigger, its timings are only estimated, and on the free tier Google may use the content. That is acceptable for original passages but not ideal. The code supports it (`TTS_PROVIDER=gemini`) if you prefer it.
- Students whose text has no pre-generated audio yet (or if no key is set) hear the most natural voice their device has. They can choose a different voice from the Follow-along box.

## How to hear each voice (no account needed unless noted)

- **Google Chirp 3 HD**: each voice has a sample on https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd. You can type your own passage on https://cloud.google.com/text-to-speech ("Try it": choose English (US), then a Chirp3-HD or Neural2 voice).
- **Google Neural2 / Studio**: the same "Try it" box. The voice list is at https://cloud.google.com/text-to-speech/docs/list-voices-and-types
- **Gemini TTS**: Google AI Studio → Generate speech: https://aistudio.google.com/generate-speech (sign in with Google)
- **Azure**: Voice Gallery: https://speech.microsoft.com/portal/voicegallery (Microsoft account). Try "Ava", "Andrew" or "Jenny" (en-US)
- **Amazon Polly**: https://console.aws.amazon.com/polly/ (AWS account) → Text-to-Speech, Engine: Generative or Neural, voices "Ruth" or "Matthew"
- **OpenAI**: https://www.openai.fm
- **ElevenLabs**: https://elevenlabs.io/text-to-speech
- **Device voices (free fallback)**: open any question in **Edge** to hear "Microsoft Ava/Jenny Online (Natural)", in **Chrome** to hear "Google US English", or on **iPad/iPhone/Mac** first download *Settings → Accessibility → Spoken Content → Voices → English (US) → Ava (Premium)*.

## Sources

- Google Cloud TTS pricing (voice tiers, free limits, `<mark>` not billed, Gemini-TTS token prices): https://cloud.google.com/text-to-speech/pricing
- Chirp 3 HD (SSML subset, no `<mark>`, speaking rate, demos): https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- `text:synthesize` v1beta1 (`enableTimePointing: SSML_MARK`, `timepoints`): https://docs.cloud.google.com/text-to-speech/docs/reference/rest/v1beta1/text/synthesize
- Gemini API pricing (TTS models, free tier, "used to improve our products"): https://ai.google.dev/gemini-api/docs/pricing
- Gemini speech generation (models, 30 voices, 24 kHz PCM/WAV output): https://ai.google.dev/gemini-api/docs/speech-generation
- Amazon Polly pricing: https://aws.amazon.com/polly/pricing/
- Azure Speech pricing (F0 0.5M characters a month): https://azure.microsoft.com/pricing/details/cognitive-services/speech-services. Per-1M rates ($16 Neural, $22 HD) from https://texttolab.com/blog/azure-text-to-speech-pricing, because the official page renders prices only in the browser.
- OpenAI TTS prices: https://costgoat.com/pricing/openai-tts (check against https://openai.com/api/pricing)
- ElevenLabs API prices and plans: https://developer.puter.com/tutorials/elevenlabs-api-pricing/ (official page: https://elevenlabs.io/pricing/api)
