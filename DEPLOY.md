# SOMA — deploy guide

Закрытая альфа на одном **Timeweb VDS (Amsterdam)**: фронт и бэк на
одном домене, nginx раздаёт статику и проксирует API. Автодеплой через
**GitHub Actions** по SSH. Доступ закрыт **alpha-key**'ом.

Без Cloudflare, без отдельного фронт-хостинга — для альфы на 5–20
человек это лишняя сложность.

## Архитектура

```
github.com/vboriskin/soma  ──► GitHub Actions ──ssh──► Timeweb VDS
                                                       ├── nginx :80/443
                                                       │   ├── /                → static (/opt/soma/frontend)
                                                       │   ├── /api/*, /auth/* → 127.0.0.1:8787
                                                       │   └── /healthz        → 127.0.0.1:8787
                                                       ├── docker compose → soma-backend container
                                                       └── /var/lib/soma  → persistent
```

URL: `https://94-241-174-144.nip.io` (nip.io — wildcard DNS, без покупки
домена). Когда купишь свой — 5 минут переключения (см. ниже).

---

## Шаг 0 — что уже есть

VDS на Timeweb (`94.241.174.144`, Amsterdam, Ubuntu 24.04, 2 ГБ RAM).
Cloud-init поставил Docker, Compose, nginx, certbot, ufw. SSH-ключ
загружен (`~/.ssh/soma_deploy` локально, `authorized_keys` на сервере).

Бэкенд развёрнут, GitHub Actions деплой работает.

---

## Bootstrap сервера (один раз)

```bash
ssh -i ~/.ssh/soma_deploy root@94.241.174.144
```

На сервере, при первом разворачивании:

```bash
# Создать SSH deploy key для приватного репо
ssh-keygen -t ed25519 -f /root/.ssh/github_deploy -N "" -C "soma-vds-deploy"
cat /root/.ssh/github_deploy.pub
# Скопировать вывод → GitHub repo → Settings → Deploy keys → Add (read-only)

# SSH config для github
cat > /root/.ssh/config <<EOF
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/github_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 /root/.ssh/config

# Клонировать репо
git clone git@github.com:vboriskin/soma.git /opt/soma

# Запустить bootstrap (поставит nginx config, выпустит LE cert,
# соберёт фронт, создаст пустой secrets.env)
bash /opt/soma/deploy/bootstrap-vds.sh
```

### Заполнить секреты

```bash
nano /opt/soma/secrets.env
```

```
ALPHA_KEY=<32 hex символа: openssl rand -hex 16>
NODE_ENV=production
PORT=8787

# CORS не нужен — same-origin. Оставляем для совместимости.
ALLOWED_ORIGINS=https://94-241-174-144.nip.io

# API-ключи источников (значения из локального backend/.env)
TUMBLR_KEY=...
DA_CLIENT_ID=...
DA_SECRET=...
ARENA_TOKEN=...
DRIBBBLE_CLIENT_ID=...
DRIBBBLE_CLIENT_SECRET=...
DRIBBBLE_COOKIE=
NYPL_TOKEN=...
OPENSEA_KEY=...
TELEGRAM_BOT_TOKEN=...
```

**Сохрани ALPHA_KEY у себя — это инвайт-код для друзей.**

### Первый запуск контейнера

```bash
cd /opt/soma/backend
docker compose up -d --build
```

Сборка ~4–5 минут (Playwright image + npm deps). Потом:

```bash
docker compose ps          # Status: healthy
curl https://94-241-174-144.nip.io/healthz
# {"ok":true,"ts":...}

curl https://94-241-174-144.nip.io/
# <html>... (фронт)

curl https://94-241-174-144.nip.io/api/info
# {"error":"alpha-key required"}

curl -H "X-Alpha-Key: <key>" https://94-241-174-144.nip.io/api/info
# {"backend":...}
```

---

## GitHub Actions автодеплой (один раз)

```bash
# Локально на маке — отдельный CI-ключ
ssh-keygen -t ed25519 -f ~/.ssh/soma_ci -N "" -C "soma-ci"

# На сервере — добавить pub в authorized_keys
PUB=$(cat ~/.ssh/soma_ci.pub)
ssh -i ~/.ssh/soma_deploy root@94.241.174.144 \
  "grep -qF '$PUB' /root/.ssh/authorized_keys || echo '$PUB' >> /root/.ssh/authorized_keys"

# Проверить что CI-ключ работает
ssh -i ~/.ssh/soma_ci root@94.241.174.144 "echo ok"

# Положить секреты в GH (нужен gh CLI)
gh secret set VDS_HOST    --body "94.241.174.144" --repo vboriskin/soma
gh secret set VDS_USER    --body "root"           --repo vboriskin/soma
gh secret set VDS_SSH_KEY < ~/.ssh/soma_ci         --repo vboriskin/soma
```

Готово. Каждый push в `main`, который меняет `backend/`, `deploy/` или
сам workflow — запускает автодеплой через
`.github/workflows/deploy-backend.yml`. Внутри: SSH в VDS →
`bash /opt/soma/deploy/deploy-vds.sh` (git pull → build frontend → docker
compose up -d).

---

## Раздача доступа

Делишься URL'ом и ключом:

> SOMA в закрытой альфе. https://94-241-174-144.nip.io
> Попросит инвайт-ключ — вот: `cba2d63acb4e56d467ba8cf081801f6f`

Чтобы отозвать всех разом — на сервере:
```bash
nano /opt/soma/secrets.env  # меняем ALPHA_KEY
cd /opt/soma/backend && docker compose up -d
```
У всех старые ключи слетят, попросят ввести новый.

---

## Кастомный домен (когда купишь)

1. Купить домен (любой, например `soma.app` на Cloudflare Registrar)
2. В DNS-провайдере домена: A-запись `soma.app → 94.241.174.144`
3. На сервере:
   ```bash
   # Получить cert для нового домена
   certbot --nginx -d soma.app
   # Обновить server_name в конфиге
   sed -i 's/94-241-174-144\.nip\.io/soma.app/g' /etc/nginx/sites-available/soma
   sed -i 's/94-241-174-144\.nip\.io/soma.app/g' /opt/soma/deploy/bootstrap-vds.sh
   systemctl reload nginx
   ```
4. (Опционально) удалить старый nip.io cert: `certbot delete --cert-name 94-241-174-144.nip.io`

Фронт на новом домене заработает сразу — `BACKEND_URL=''` использует
`location.host`, никаких правок в коде.

---

## Полезные команды на сервере

```bash
# Логи бэкенда (хвост)
cd /opt/soma/backend && docker compose logs -f --tail 100

# Перезапустить с новым secrets.env (без билда)
cd /opt/soma/backend && docker compose up -d

# Полная пересборка
cd /opt/soma/backend && docker compose up -d --build

# Использование ресурсов
docker stats --no-stream
free -m

# Сертификаты (auto-renew работает; проверка)
certbot certificates

# Зайти в контейнер
docker exec -it soma-backend sh

# Ручной деплой (то же что делает GitHub Actions)
bash /opt/soma/deploy/deploy-vds.sh

# Откат на предыдущий коммит
cd /opt/soma && git log --oneline | head -5
git reset --hard <prev-sha> && bash deploy/deploy-vds.sh
```

---

## Стоимость

| Статья | ₽/мес |
|---|---|
| Timeweb VDS (Amsterdam, 2GB RAM) | ~600–800 |
| Публичный IPv4 | 180 |
| GitHub Actions | 0 (free tier) |
| Let's Encrypt + nip.io | 0 |
| **Итого** | **~800 ₽/мес** |

---

## Чек-лист «готово к раздаче ключа»

- [x] `https://94-241-174-144.nip.io/healthz` → 200
- [x] `https://94-241-174-144.nip.io/api/info` без ключа → 401
- [x] `https://94-241-174-144.nip.io/api/info` с ключом → 200
- [ ] `https://94-241-174-144.nip.io/` грузит SOMA, prompt спрашивает ключ
- [ ] Поиск возвращает результаты с 3+ источников
- [x] GH Actions: `workflow_dispatch` → `success`

---

## Troubleshooting

**`docker compose build` падает на Playwright**
- Проверь `free -m`. Если меньше 1 ГБ — апгрейдь VDS до 4 ГБ.

**Контейнер всё время рестартует**
- `docker compose logs --tail 50 backend`
- Чаще всего — пустой `ALPHA_KEY` в `secrets.env` или отсутствие нужного
  API-ключа.

**Cert не обновляется**
- `certbot renew --dry-run` — проверка
- Cron-таск стоит автоматом (`/etc/cron.d/certbot`)

**После правки nginx config в репе ничего не изменилось**
- Deploy script не трогает nginx config (хрупко из-за certbot).
- Применить: `ssh root@server 'bash /opt/soma/deploy/bootstrap-vds.sh'`

**`502 Bad Gateway`**
- Бэкенд не отвечает на 8787. Проверить контейнер:
  `cd /opt/soma/backend && docker compose ps`
