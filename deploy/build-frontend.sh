#!/usr/bin/env bash
# Сборка статики для Cloudflare Pages.
# Кладём в `dist/` ТОЛЬКО фронтовые файлы — без `backend/`, audit-md и
# логотип-исходников. Cloudflare Pages публикует `dist/` как корень сайта.
#
# Запускается:
# - Cloudflare Pages (build command: `bash deploy/build-frontend.sh`)
# - локально для отладки билда (`bash deploy/build-frontend.sh && cd dist && python3 -m http.server`)

set -euo pipefail

DIST="${DIST:-dist}"
rm -rf "$DIST"
mkdir -p "$DIST"

# Главный файл — переименовываем в index.html, чтобы Cloudflare отдавал
# его на запрос `/`.
cp soma.html "$DIST/index.html"

# Иконки/манифест/SW/ритуалы.
cp favicon.svg            "$DIST/"
cp app-icon-512.svg       "$DIST/"
cp og-image.svg           "$DIST/"
cp manifest.webmanifest   "$DIST/"
cp sw.js                  "$DIST/"
cp rituals.json           "$DIST/"

# `_headers` — security/cache настройки Cloudflare Pages
# (https://developers.cloudflare.com/pages/configuration/headers/)
cat > "$DIST/_headers" <<'HDR'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()

/sw.js
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/*.svg
  Cache-Control: public, max-age=86400

/*.json
  Cache-Control: public, max-age=300
HDR

echo "[build-frontend] dist/ ready:"
ls -lh "$DIST"
