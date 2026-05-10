# SOMA — deploy guide

Закрытая альфа: фронт на **Cloudflare Pages**, бэк на **Timeweb VDS
(Amsterdam)**, автодеплой через **GitHub Actions** по SSH. Доступ закрыт
**alpha-key**'ом.

## Архитектура

```
github.com/vboriskin/soma  ─┬─► Cloudflare Pages   ─►  https://soma-frontend.pages.dev
                            │   (build: deploy/build-frontend.sh, output: dist)
                            │
                            └─► GitHub Actions ──ssh──► Timeweb VDS
                                                        ├── docker compose: soma-backend container
                                                        ├── nginx + Let's Encrypt
                                                        └── /var/lib/soma → persistent
```

Бэкенд доступен по `https://<IP-with-dashes>.nip.io` (для альфы — без
покупки домена). Когда дойдут руки до домена — DNS-запись + 1 правка в
nginx-конфиге + 1 правка `BACKEND_URL` во фронте.

---

## Шаг 0 — что уже есть

VDS на Timeweb (`94.241.174.144`, Amsterdam, Ubuntu 24.04, 2 ГБ RAM).
Cloud-init поставил Docker, Compose, nginx, certbot, ufw. SSH-ключ
загружен (`~/.ssh/soma_deploy` локально, `authorized_keys` на сервере).

---

## Шаг 1 — Bootstrap сервера (один раз)

На своей машине:

```bash
ssh -i ~/.ssh/soma_deploy root@94.241.174.144
```

На сервере:

```bash
# Запускаем bootstrap-скрипт прямо из репо
curl -fsSL https://raw.githubusercontent.com/vboriskin/soma/main/deploy/bootstrap-vds.sh | bash
```

Скрипт:
- клонирует репо в `/opt/soma`
- создаёт пустой `/opt/soma/secrets.env`
- ставит nginx-конфиг для `94-241-174-144.nip.io`
- выпускает Let's Encrypt сертификат (HTTP challenge, ~30 сек)

Если certbot ругается — проверь что 80 порт открыт извне
(`curl http://94-241-174-144.nip.io/` с локального мака должно отдать
nginx-страницу или ошибку).

### Заполнить секреты

```bash
nano /opt/soma/secrets.env
```

Скопируй из локального `backend/.env` всё нужное:

```
ALPHA_KEY=<32 hex символа: openssl rand -hex 16>
ALLOWED_ORIGINS=https://soma-frontend.pages.dev
ALLOW_PAGES_DEV=1

TUMBLR_KEY=...
DA_CLIENT_ID=...
DA_SECRET=...
ARENA_TOKEN=...
DRIBBBLE_CLIENT_ID=...
DRIBBBLE_CLIENT_SECRET=...
DRIBBBLE_COOKIE=...
NYPL_TOKEN=...
OPENSEA_KEY=...
```

**Сохрани ALPHA_KEY где-то у себя — это будущий инвайт-код для друзей.**

### Первый запуск контейнера

```bash
cd /opt/soma/backend
docker compose up -d --build
```

Сборка ~4–5 минут (тащит Playwright-image ~600 МБ → ставит npm deps).
Потом:

```bash
docker compose ps               # Status: healthy ожидаем
curl https://94-241-174-144.nip.io/healthz
# {"ok":true,"ts":...}

curl https://94-241-174-144.nip.io/api/info
# {"error":"alpha-key required",...}    ← правильно

curl -H "X-Alpha-Key: <ваш_ключ>" https://94-241-174-144.nip.io/api/info
# {"backend":...}                       ← правильно
```

---

## Шаг 2 — GitHub Actions secrets

Чтобы push в `main` автоматически деплоил на VDS:

```bash
# На своей машине — создаём отдельный SSH-ключ для CI
ssh-keygen -t ed25519 -f ~/.ssh/soma_ci -N "" -C "soma-ci"
# Кладём pub-часть на сервер
ssh-copy-id -i ~/.ssh/soma_ci.pub root@94.241.174.144
# Проверяем
ssh -i ~/.ssh/soma_ci root@94.241.174.144 "echo ok"
# Получаем приватный ключ для GH:
cat ~/.ssh/soma_ci
```

GitHub: репо → **Settings → Secrets and variables → Actions** → New
repository secret. Создаём три секрета:

| Name | Value |
|---|---|
| `VDS_HOST` | `94.241.174.144` |
| `VDS_USER` | `root` |
| `VDS_SSH_KEY` | содержимое `~/.ssh/soma_ci` (приватный ключ, **не .pub**) |

Готово. Теперь `git push origin main` с правкой в `backend/` или
`deploy/` запускает workflow (`.github/workflows/deploy-backend.yml`),
который SSH-ит в сервер и выполняет `bash deploy/deploy-vds.sh`.

---

## Шаг 3 — Cloudflare Pages (фронт)

1. https://dash.cloudflare.com/sign-up — регистрация
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. Выбираешь репо `vboriskin/soma`
4. Settings:
   - **Project name**: `soma-frontend`
   - **Production branch**: `main`
   - **Framework preset**: None
   - **Build command**: `bash deploy/build-frontend.sh`
   - **Build output directory**: `dist`
5. **Save and Deploy** → через ~30 сек проект на `https://soma-frontend.pages.dev`

Открой → введи alpha-ключ → должно заработать.

---

## Шаг 4 — Smoke-test end-to-end

1. https://soma-frontend.pages.dev в incognito
2. Prompt спрашивает alpha-ключ → вставляешь свой
3. Делаешь поиск: должны прийти результаты с разных источников
4. DevTools Network: запросы на `94-241-174-144.nip.io` с заголовком `X-Alpha-Key`

---

## Раздача доступа

Текущая модель — общий `ALPHA_KEY` для всех альфа-юзеров. Делишься
сообщением вида:

> Привет! SOMA в закрытой альфе. https://soma-frontend.pages.dev
> попросит ключ — вот: `7a3f2b8d4e1c9f5a6b8d2e3f4a1b9c8d`

Когда нужно отозвать всех — на сервере `nano /opt/soma/secrets.env`,
меняешь `ALPHA_KEY=новый`, `cd /opt/soma/backend && docker compose up -d`.
У всех старые ключи слетят, попросят ввести заново.

(После альфы заменим на индивидуальные инвайт-коды + magic-link login по
email — Этап 1 из общего плана.)

---

## Кастомный домен (потом)

Когда купишь, скажем, `soma.app`:

1. **Cloudflare Pages → Custom domains** → `soma.app` (или `app.soma.app`)
2. **DNS на Cloudflare**: A-запись `api.soma.app → 94.241.174.144`,
   proxy mode = DNS only (серое облако — иначе certbot не получит cert)
3. **На сервере**:
   ```bash
   certbot --nginx -d api.soma.app
   sed -i 's/94-241-174-144.nip.io/api.soma.app/g' /etc/nginx/sites-available/soma
   systemctl reload nginx
   ```
4. **Во фронте** — поменять `BACKEND_URL` в `soma.html`:
   ```js
   return 'https://api.soma.app';
   ```
5. **В secrets.env** на сервере — обновить `ALLOWED_ORIGINS`:
   ```
   ALLOWED_ORIGINS=https://soma.app
   ```
   (или твой Cloudflare Pages domain если custom domain не настроил)
6. Push → автодеплой подхватит.

---

## Полезные команды на сервере

```bash
# Логи бэкенда (хвост)
cd /opt/soma/backend && docker compose logs -f --tail 100

# Перезапустить с новыми secrets.env (без билда)
cd /opt/soma/backend && docker compose up -d

# Полный пересбор + перезапуск
cd /opt/soma/backend && docker compose up -d --build

# Использование памяти/CPU
docker stats --no-stream

# Проверить cert (renewals автоматом, но проверить полезно)
certbot certificates

# Зайти внутрь контейнера
docker exec -it soma-backend sh

# Посмотреть persistent данные
ls -la /var/lib/soma/

# Откат к предыдущему коммиту (если новый деплой сломал)
cd /opt/soma && git log --oneline | head -5
git reset --hard <prev-sha> && bash deploy/deploy-vds.sh
```

---

## Стоимость

| Статья | ₽/мес |
|---|---|
| Timeweb VDS (Amsterdam, 2GB RAM) | ~600–800 |
| Публичный IPv4 | 180 |
| Cloudflare Pages | 0 |
| GitHub Actions | 0 (free tier) |
| Let's Encrypt | 0 |
| **Итого** | **~800 ₽/мес** |

---

## Чек-лист «готово к раздаче ключа друзьям»

- [ ] `curl https://94-241-174-144.nip.io/healthz` → 200
- [ ] `curl https://94-241-174-144.nip.io/api/info` без ключа → 401
- [ ] `curl -H "X-Alpha-Key: <key>" https://...nip.io/api/info` → 200
- [ ] `https://soma-frontend.pages.dev` грузится, спрашивает ключ, пускает
- [ ] Поиск возвращает результаты хотя бы с 3 источников (Reddit,
      Wallhaven, Internet Archive — самые надёжные)
- [ ] GH Actions: тестовый push в `backend/` запустил workflow,
      завершился `success`
- [ ] (опционально) UptimeRobot пингует `/healthz`

---

## Troubleshooting

**`certbot` не выпускает сертификат**
- 80 порт должен быть открыт извне: `sudo ufw status` → должно быть
  `80/tcp ALLOW`
- DNS должен резолвить: `dig 94-241-174-144.nip.io` → 94.241.174.144

**`docker compose build` падает на Playwright**
- Проверь свободную память: `free -m`. Если меньше 1 ГБ — увеличь VDS
  до 4 ГБ или используй remote-build (мы пока не делали).

**CORS-ошибка в браузере**
- В `secrets.env` на сервере должен быть `ALLOWED_ORIGINS=https://...pages.dev`
  ровно с тем доменом, который грузит фронт. После правки —
  `docker compose up -d` (рестарт).

**Бэкенд `Cannot find module '/app/server.js'`**
- В Dockerfile `COPY . .` копирует `backend/` целиком. Убедись, что
  `git pull` отработал (`cd /opt/soma && git log -1`) и что у тебя
  свежий код.

**Контейнер всё время рестартует**
- `docker compose logs --tail 50 backend` — смотрим почему падает.
  Чаще всего — отсутствует обязательный env-vars (`TUMBLR_KEY` и т.п.)
  или ALPHA_KEY пустой.
