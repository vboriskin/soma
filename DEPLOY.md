# SOMA — deploy guide

Закрытая альфа на Cloudflare Pages (фронт) + Fly.io (бэк) + GitHub Actions
(автодеплой бэка при push в `main`). Кастомный домен прикручиваем в самом
конце.

## Архитектура

```
github.com/vboriskin/soma  ─┬─► Cloudflare Pages   ─►  https://soma-frontend.pages.dev
                            │   (build: deploy/build-frontend.sh, output: dist)
                            │
                            └─► Fly.io (GitHub Actions) ─►  https://soma-backend.fly.dev
                                (Dockerfile в backend/)        + persistent volume /data
```

Закрыто **alpha-ключом**: фронт спрашивает ключ при первом заходе, шлёт в
header `X-Alpha-Key`, бэк проверяет через env `ALPHA_KEY`.

---

## Шаг 1 — Fly.io бэкенд

### 1.1 Зарегистрировать аккаунт
https://fly.io/app/sign-up — нужна карта (с неё спишут $0; alpha-ресурсы
влезают в free tier).

### 1.2 Поставить flyctl локально
```bash
brew install flyctl
fly auth login
```

### 1.3 Создать приложение и volume
```bash
cd backend
fly apps create soma-backend                          # имя должно совпадать с fly.toml
fly volumes create soma_data --region fra --size 3    # 3 ГБ под SQLite/cookies/cache
```
Если регион Frankfurt не подходит — отредактируй `primary_region` в
`backend/fly.toml` и используй тот же код в `volumes create`.

### 1.4 Сгенерить alpha-ключ и положить секреты
```bash
# Сгенерируй случайный ключ (32 hex-символа):
openssl rand -hex 16
# скажем, получилось: 7a3f2b8d4e1c9f5a6b8d2e3f4a1b9c8d

cd backend
fly secrets set ALPHA_KEY=7a3f2b8d4e1c9f5a6b8d2e3f4a1b9c8d
fly secrets set TUMBLR_KEY=...           # из локального .env
fly secrets set DA_CLIENT_ID=...
fly secrets set DA_SECRET=...
fly secrets set ARENA_TOKEN=...
fly secrets set DRIBBBLE_CLIENT_ID=...
fly secrets set DRIBBBLE_CLIENT_SECRET=...
fly secrets set DRIBBBLE_COOKIE=...
fly secrets set NYPL_TOKEN=...
fly secrets set OPENSEA_KEY=...
fly secrets set ALLOW_PAGES_DEV=1        # пока не привязали кастомный домен
```
**Сохрани ALPHA_KEY где-то** — будешь раздавать друзьям как инвайт.
Список всех секретов из бэкенда — в `backend/.env.example`.

### 1.5 Первый деплой вручную
```bash
fly deploy --remote-only
```
Сборка ~3–5 минут (тащит Playwright-образ ~600 МБ → собирает Node deps →
пушит в Fly registry → запускает машину). Когда увидишь `Visit your newly
deployed app at https://soma-backend.fly.dev/` — открой в браузере, должно
быть `soma backend — ok`.

Проверить gate:
```bash
curl https://soma-backend.fly.dev/healthz
# {"ok":true,"ts":...}

curl https://soma-backend.fly.dev/api/info
# {"error":"alpha-key required",...}    ← правильно

curl -H 'X-Alpha-Key: ВАШ_КЛЮЧ' https://soma-backend.fly.dev/api/info
# {"backend":...}                       ← правильно
```

### 1.6 Настроить автодеплой через GitHub Actions
```bash
fly tokens create deploy -x 999999h     # долгоживущий токен для CI
# скопировать вывод (начинается с FlyV1 fm2_...)
```
GitHub: **Settings → Secrets and variables → Actions → New repository
secret**:
- `Name`: `FLY_API_TOKEN`
- `Value`: вставить токен

Готово — теперь любой `git push origin main`, который меняет файлы в
`backend/`, автоматически запускает `flyctl deploy` через
`.github/workflows/deploy-backend.yml`.

---

## Шаг 2 — Cloudflare Pages фронтенд

### 2.1 Зарегистрировать Cloudflare
https://dash.cloudflare.com/sign-up

### 2.2 Подключить репо к Pages
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Авторизоваться в GitHub, выбрать репо `vboriskin/soma`
3. **Project name**: `soma-frontend`
4. **Production branch**: `main`
5. **Framework preset**: None
6. **Build command**: `bash deploy/build-frontend.sh`
7. **Build output directory**: `dist`
8. **Root directory** (advanced): оставить пустым (=корень репо)
9. **Save and Deploy**

Через ~30 сек проект задеплоится на `https://soma-frontend.pages.dev`.
Зайди — должна загрузиться SOMA. Браузер спросит alpha-ключ — введи тот,
что ты положил в Fly secrets.

### 2.3 (Только если меняли имена) обновить URL'ы в коде
Если назвал Fly-приложение **не** `soma-backend` — найди в `soma.html`:
```js
return 'https://soma-backend.fly.dev';
```
Замени на свой домен и закоммить. Аналогично — Cloudflare Pages в
`fly.toml` (`ALLOWED_ORIGINS`) если имя проекта Pages не `soma-frontend`.

---

## Шаг 3 — Проверка end-to-end

1. Открой `https://soma-frontend.pages.dev` в чистом браузере (или incognito)
2. Браузер показал prompt → введи ALPHA_KEY → зашёл в SOMA
3. Сделай поиск — должны прийти результаты с разных источников
4. В DevTools Network видно запросы на `soma-backend.fly.dev` с заголовком
   `X-Alpha-Key`

Если что-то не работает:
- **CORS error** в консоли → проверь `fly secrets list` — там должен быть
  `ALLOWED_ORIGINS=https://soma-frontend.pages.dev` (или `ALLOW_PAGES_DEV=1`)
- **401 после ввода ключа** → ключ не совпадает; в браузерном LS почисти
  `soma.alphaKey` и введи заново
- **Бэкенд не стартует** → `fly logs --app soma-backend`

---

## Шаг 4 — Кастомный домен (опционально, потом)

### 4.1 Купить домен
Cloudflare Registrar — без накрутки, по wholesale-цене. Варианты:
- `.app` ~$14/год
- `.so` ~$35/год
- `.studio` ~$22/год
- `.design` ~$30/год

### 4.2 Привязать к Pages
Cloudflare Pages → проект `soma-frontend` → **Custom domains** → **Set up a
custom domain** → ввести `soma.example.com` → подтвердить (DNS-запись
создастся автоматом если домен на Cloudflare).

### 4.3 Привязать к Fly
```bash
fly certs add api.soma.example.com --app soma-backend
fly certs check api.soma.example.com --app soma-backend
```
В Cloudflare DNS добавь `CNAME` запись:
- **Name**: `api`
- **Target**: `soma-backend.fly.dev`
- **Proxy status**: DNS only (серое облако) — иначе fly не сможет
  получить TLS-сертификат через ACME

Подождать пока `fly certs check` покажет `✔ Issued`.

### 4.4 Обновить URL'ы
В `soma.html` поменять `BACKEND_URL` для прода:
```js
return 'https://api.soma.example.com';
```
В `backend/fly.toml`:
```toml
ALLOWED_ORIGINS = "https://soma.example.com"
```
И снять `ALLOW_PAGES_DEV=1` через `fly secrets unset ALLOW_PAGES_DEV`.

Push → автодеплой обоих → готово.

---

## Раздача инвайтов

Сейчас «инвайт» = **alpha-ключ**, общий для всех альфа-юзеров. Это
временно. План на Этап 1 (после стабилизации деплоя):
1. SQLite + таблица `invites` с уникальными кодами
2. Magic-link login по email через Resend
3. Замена общего `ALPHA_KEY` на per-user сессии

Пока — отправляешь друзьям сообщение типа:
> Привет! SOMA в закрытой альфе. Зайди https://soma.example.com — попросят ключ. Вот: `7a3f2b8d4e1c9f5a6b8d2e3f4a1b9c8d`

Когда будет нужно отозвать всех разом — `fly secrets set ALPHA_KEY=новый`,
автодеплой подхватит, у всех слетит, попросят новый.

---

## Стоимость

- **Cloudflare Pages**: $0 (в free tier 500 builds/мес, неограниченные
  requests)
- **Fly.io**: ~$5/мес (1 shared CPU, 1 ГБ RAM, 3 ГБ volume; машина может
  гаситься при простое — `auto_stop_machines = "stop"`)
- **Домен**: ~$1–3/мес амортизация
- **GitHub Actions**: $0 (2000 минут/мес в free tier; деплой ~3 мин →
  хватит на ~600 деплоев)

**Итого: ~$6–8/мес**.

---

## Чеклист «всё готово к раздаче ключа друзьям»

- [ ] Fly app `soma-backend` отвечает на `/healthz`
- [ ] `fly secrets list` содержит ALPHA_KEY и все API-ключи источников
- [ ] Cloudflare Pages деплоит `dist/` без ошибок
- [ ] Открыл pages.dev в incognito — gate спрашивает ключ — пускает
- [ ] Поиск работает (Reddit, Wallhaven, Internet Archive — наверняка
  отвечают, остальные опционально)
- [ ] GitHub Actions: тестовый push в `backend/` запустил workflow и
  завершился `success`
- [ ] UptimeRobot пингует `/healthz` (опционально, но рекомендую)
