#!/usr/bin/env bash
# deploy-vds.sh — выполняется на сервере при каждом push в main.
# Зовётся из GitHub Actions через SSH, либо вручную:
#   ssh root@SERVER 'bash -s' < deploy/deploy-vds.sh
# Идемпотентен: можно запускать сколько угодно раз.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/soma}"
FRONTEND_DIR="${FRONTEND_DIR:-/opt/soma/frontend}"

cd "$APP_DIR"

echo "[deploy] git fetch + pull"
git fetch --prune origin
git reset --hard origin/main

# ----- Frontend: собираем dist/, синхронизируем в /opt/soma/frontend -----
echo "[deploy] build frontend"
bash "$APP_DIR/deploy/build-frontend.sh"
mkdir -p "$FRONTEND_DIR"
# rsync с --delete: удаляем файлы, которых больше нет в dist/
rsync -a --delete "$APP_DIR/dist/" "$FRONTEND_DIR/"
echo "[deploy] frontend synced to $FRONTEND_DIR"

# NB: nginx config мы не трогаем здесь. Если в репе изменился
# deploy/nginx-soma.conf — нужно re-bootstrap'нуть руками:
#   ssh root@server 'bash /opt/soma/deploy/bootstrap-vds.sh'
# Это редкий кейс — обычно меняется только статика и бэкенд-код.

# ----- Backend: docker compose build + up -----
echo "[deploy] docker compose build"
cd "$APP_DIR/backend"
docker compose build

echo "[deploy] docker compose up -d (rolling)"
docker compose up -d --remove-orphans

# Чистим старые слои (раз в десяток деплоев экономит десятки ГБ).
echo "[deploy] docker prune"
docker image prune -f --filter "until=168h" || true

# ----- Healthcheck -----
echo "[deploy] healthcheck"
sleep 4
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:8787/healthz > /dev/null; then
    echo "[deploy] ✓ /healthz OK"
    exit 0
  fi
  echo "[deploy] waiting for backend... ($i/10)"
  sleep 2
done

echo "[deploy] ✗ healthcheck failed — last logs:"
docker compose logs --tail 50 backend
exit 1
