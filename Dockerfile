# syntax=docker/dockerfile:1.7
# Al-Anjal Adaptive ELA (Phase 13). Two images from one file:
#   docker build --target web  -t alanjal-ela-web .    # the website (Next.js standalone + PDF engine)
#   docker build --target jobs -t alanjal-ela-jobs .   # migrations, scheduled jobs, one-off scripts
# No secrets are baked in: all configuration comes from the environment at run time.

ARG NODE_VERSION=22.12.0

# ---------------------------------------------------------------- dependencies
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# a committed lockfile makes builds reproducible (create it once with `npm install`)
RUN test -f package-lock.json || { echo "package-lock.json is missing: run 'npm install' once and commit it." >&2; exit 1; } \
 && npm ci

# ---------------------------------------------------------------------- build
FROM deps AS build
COPY . .
# placeholder only: `prisma generate` and `next build` need a syntactically valid URL, never a real one
ENV DATABASE_URL="mysql://build:build@127.0.0.1:3306/build" NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# ------------------------------------------------------------------------ web
FROM node:${NODE_VERSION}-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright REPORT_FONT_DIR=/app/assets/fonts REPORT_BRANDING_DIR=/app/storage/branding UPLOAD_DIR=/app/storage/uploads
RUN apt-get update && apt-get install -y --no-install-recommends tini openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# Prisma engine and the PDF engine are loaded at run time; copy them explicitly
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --chown=node:node assets ./assets
# Chromium headless shell for PDF reports, with its system libraries (same version as playwright-core)
RUN node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
 && rm -rf /var/lib/apt/lists/* && chmod -R a+rX /ms-playwright \
 && mkdir -p /app/storage/branding /app/storage/uploads && chown -R node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm","run","start:standalone"]

# ----------------------------------------------------------------------- jobs
# ----------------------------------------------------------------------- jobs
FROM deps AS jobs
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node . .
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "--silent", "jobs:scheduler"]

# ----------------------------------------------------------------------- Render default web
FROM web AS production
CMD ["node", "server.js"]