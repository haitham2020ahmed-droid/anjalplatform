# Hosting: memory on small plans (Render Starter, 512 MB)

The platform must keep working on Render's Starter plan (0.5 CPU, 512 MB RAM). Update 42A made the server
memory-safe on that plan. This page explains the settings that matter. Full deployment steps are in
[DEPLOYMENT.md](DEPLOYMENT.md).

## Start command

Keep the Render start command as:

```
npm start
```

`npm start` now runs `scripts/start.mjs`, which starts `next start` with a **safe heap limit**
(`--max-old-space-size`) of about **70% of the memory the server really has**:

| Where the memory figure comes from | Heap limit |
|---|---|
| `WEB_MEMORY_MB` environment variable, when set | 70% of it |
| otherwise the container's memory limit (Linux cgroup v2 / v1) | 70% of it |
| otherwise | 70% of 512 MB = **358 MB** |

The limit is never below 256 MB. If `NODE_OPTIONS` already contains `--max-old-space-size=…`, that value is
used and the wrapper adds nothing. The first log line says which limit was used, e.g.
`[start] heap limit 358 MB (memory: container limit 512 MB)`.

Why: without a limit, Node sizes its heap from the machine, not from the plan. The server then lets
garbage pile up until V8 aborts with `FatalProcessOutOfMemory` (exit code 134) and Render shows 502 until
it restarts. With the limit, V8 collects garbage early enough.

**Optional environment variable**

| Variable | Meaning |
|---|---|
| `WEB_MEMORY_MB` | The plan's memory in MB, e.g. `512` (Starter) or `2048` (Standard). Set it if the log line shows a wrong figure, or lower it (e.g. `450`) to leave more room for the PDF engine. |

`npm run start:plain` runs `next start` without the wrapper (for troubleshooting only).

The Docker image runs the same wrapper (`node scripts/start.mjs --standalone`), so Docker hosting gets the
same limit.

## What was changed to stay inside 512 MB (Update 42A)

- **Question import:** at most **1,000 questions per file**. A larger file is refused with the message
  “The file has N questions; the limit is 1,000 per file. Split the file into smaller files …”. The
  duplicate check no longer loads the whole question bank: it reads the bank in pages of 500 questions
  (only id, text and choices) and keeps in memory only the bank questions that could really match a row
  of the file. Preview rows are saved 200 at a time; the browser gets the preview without the copy of each
  spreadsheet row and with only the start of each passage.
- **No crash loop:** a step that stopped the server (an import chunk, an AI batch) is not repeated
  forever by the page that resumes it. After **2** such stops the job is marked **FAILED** with a clear
  message (split the file / run the AI tool on fewer questions). A file that was being checked when the
  server stopped is shown as failed in the import history. The daily learning job is retried at most
  twice a day after a crash.
- **Bounded reads and caches:** lists read only the rows they show (database ordering and limits); the
  in-memory caches keep a fixed number of entries.
- **Heavy libraries load only when used:** the PDF reader (pdf.js, for MAP ASG and Learning Continuum
  PDFs) and the PDF report engine are loaded the first time such a file or report is made, never at start.

## If the server still runs out of memory

1. Render → Logs: look for `FatalProcessOutOfMemory` and the request just before it.
2. Import big question files in parts (up to 1,000 questions; 200–400 is fastest).
3. PDF reports start a headless Chromium (outside the JavaScript heap). On 512 MB set
   `REPORT_PDF_CONCURRENCY=1`, or lower `WEB_MEMORY_MB` to about `450`.
4. If the school grows well beyond a few thousand students, move to the Standard plan (2 GB) and set
   `WEB_MEMORY_MB=2048`.
