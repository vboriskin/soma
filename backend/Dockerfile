# SOMA backend — Express + Playwright (headless Chromium для SPA-источников
# вроде cosmos.so, pinterest, land-book). Образ Microsoft Playwright уже несёт
# системные либы и предустановленный Chromium — это экономит и место (vs.
# слепить самому из node:slim + apt-get), и ~3 минуты сборки.
#
# Версия должна совпадать с playwright в package.json. Сейчас 1.59.x.

FROM mcr.microsoft.com/playwright:v1.59.1-noble

ENV NODE_ENV=production
ENV PORT=8787

WORKDIR /app

# Сначала только манифесты — кешируем `npm ci` пока зависимости не меняются.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Дальше — исходники. Меняются чаще, поэтому отдельный слой.
COPY . .

# Persistent data dir для SQLite/cookies/cache. На Fly.io подключим volume.
RUN mkdir -p /data
ENV DATA_DIR=/data

EXPOSE 8787

# Healthcheck — Fly использует `http_checks` из fly.toml, но docker-локально
# тоже полезно.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8787/healthz || exit 1

CMD ["node", "server.js"]
