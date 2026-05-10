#!/usr/bin/env bash
# bootstrap-vds.sh — одноразовая настройка свежего Ubuntu 24.04 VDS.
# Cloud-init уже поставил docker, nginx, certbot, ufw. Этот скрипт
# доделывает SOMA-специфичные шаги:
#   1) клонирует репо в /opt/soma
#   2) кладёт пустой /opt/soma/secrets.env (юзер заполнит сам)
#   3) ставит nginx-конфиг и активирует
#   4) выпускает Let's Encrypt сертификат для nip.io домена
#
# Запуск (один раз, на сервере):
#   curl -fsSL https://raw.githubusercontent.com/vboriskin/soma/main/deploy/bootstrap-vds.sh | bash
# или клонировать вручную и запустить bash deploy/bootstrap-vds.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vboriskin/soma.git}"
APP_DIR="${APP_DIR:-/opt/soma}"
HOSTNAME_NIP="${HOSTNAME_NIP:-94-241-174-144.nip.io}"
LE_EMAIL="${LE_EMAIL:-}"   # certbot email (для уведомлений об expire)

log() { echo "[bootstrap] $*"; }

# ----- 1. Repo -----
if [ ! -d "$APP_DIR/.git" ]; then
  log "cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  log "repo already exists at $APP_DIR — pulling"
  git -C "$APP_DIR" pull --ff-only
fi

# ----- 2. secrets.env заглушка -----
if [ ! -f /opt/soma/secrets.env ]; then
  log "creating empty /opt/soma/secrets.env — заполни его перед запуском"
  cat > /opt/soma/secrets.env <<'EOF'
# === SOMA backend secrets ===
# Заполни значения. Перезапусти контейнер после изменений:
#   cd /opt/soma/backend && docker compose up -d

# Альфа-ключ — общий для всех приглашённых (потом заменим на per-user)
ALPHA_KEY=

# CORS — Cloudflare Pages domain (после привязки кастомного домена допиши его через запятую)
ALLOWED_ORIGINS=https://soma-frontend.pages.dev
ALLOW_PAGES_DEV=1

# API-ключи источников (значения возьми из локального backend/.env)
TUMBLR_KEY=
DA_CLIENT_ID=
DA_SECRET=
ARENA_TOKEN=
DRIBBBLE_CLIENT_ID=
DRIBBBLE_CLIENT_SECRET=
DRIBBBLE_COOKIE=
NYPL_TOKEN=
OPENSEA_KEY=
EOF
  chmod 600 /opt/soma/secrets.env
  log "WARN: /opt/soma/secrets.env пустой — заполни его перед первым запуском"
fi

# ----- 3. Nginx конфиг -----
NGINX_LINK=/etc/nginx/sites-enabled/soma
NGINX_CONF=/etc/nginx/sites-available/soma
log "installing nginx config for $HOSTNAME_NIP"
# Подменяем server_name из шаблона (на случай если IP сменится — env override)
sed "s/94-241-174-144\.nip\.io/$HOSTNAME_NIP/g" "$APP_DIR/deploy/nginx-soma.conf" > "$NGINX_CONF"
ln -sf "$NGINX_CONF" "$NGINX_LINK"
# Удаляем дефолтную nginx-страницу
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ----- 4. Let's Encrypt -----
if [ -d "/etc/letsencrypt/live/$HOSTNAME_NIP" ]; then
  log "LE cert already exists for $HOSTNAME_NIP"
else
  log "issuing Let's Encrypt cert for $HOSTNAME_NIP"
  CERTBOT_ARGS=(--nginx -d "$HOSTNAME_NIP" --non-interactive --agree-tos --redirect)
  if [ -n "$LE_EMAIL" ]; then
    CERTBOT_ARGS+=(--email "$LE_EMAIL")
  else
    CERTBOT_ARGS+=(--register-unsafely-without-email)
  fi
  certbot "${CERTBOT_ARGS[@]}" || {
    log "certbot failed — проверь что 80 порт открыт и DNS резолвит $HOSTNAME_NIP в этот сервер"
    exit 1
  }
fi

log "✓ bootstrap done"
log "Next:"
log "  1. fill /opt/soma/secrets.env"
log "  2. cd /opt/soma/backend && docker compose up -d --build"
log "  3. curl https://$HOSTNAME_NIP/healthz"
