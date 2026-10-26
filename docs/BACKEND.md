# Свой приёмник: аналитика, отзывы, админка

Код — `worker/index.ts`. При `npm run build` он собирается в `dist/_worker.js`, и Cloudflare Pages
запускает его вместе с сайтом (режим «advanced», работает и при загрузке архива через «Create deployment»).
Адреса: `POST /api/events`, `POST /api/feedback`, `HEAD /api/time`, `GET /admin`.

## Подключить один раз (5 минут, в панели Cloudflare)

1. **Storage & Databases → D1 SQL Database → Create** — имя `thousands`. Таблицы создавать не нужно:
   приёмник создаёт их сам при первом запросе.
2. **Workers & Pages → проект сайта → Settings → Bindings → Add → D1 database**:
   имя переменной `DB`, база `thousands`. Для Production (и Preview, если нужно).
3. **Settings → Variables and Secrets → Add** (тип Secret):
   - `ADMIN_PASSWORD` — пароль для `https://thousands.life/admin` (логин в окне браузера — любой);
   - `TELEGRAM_TOKEN` и `TELEGRAM_CHAT_ID` — необязательно: копия каждого отзыва в Telegram.
     Токен даёт @BotFather (`/newbot`); chat_id — напишите боту и откройте
     `https://api.telegram.org/bot<токен>/getUpdates`, там `chat.id`.
4. Загрузите новую сборку (Create deployment) — привязки применяются к следующему развёртыванию.

Проверка: `https://thousands.life/admin` спрашивает пароль и показывает отчёты; после пары минут игры
в «Воронке» появляются цифры.

## Что хранится

- `events(ts, player_id, session_id, name, params_json, platform, build)` — события игры (список — `docs/ANALYTICS.md`).
- `feedback(ts, player_id, rating, answers_json, contact, context_json)` — отзывы.

`player_id` — случайный UUID в браузере игрока, не связан с личностью. IP-адреса не записываются:
они используются только в памяти для ограничения частоты (60 событий и 10 отзывов в минуту с адреса).
Запросы принимаются только с thousands.life, *.pages.dev проекта и доменов Яндекс Игр (CORS).

Если база не подключена, игра работает как обычно: события теряются, отзывы копятся у игрока
и отправляются при следующем запуске.

## Свои запросы

D1 → база `thousands` → Console. Например, отзывы за неделю:

```sql
SELECT datetime(ts/1000,'unixepoch') AS time, rating, answers_json FROM feedback
WHERE ts > (strftime('%s','now') - 7*86400) * 1000 ORDER BY ts DESC;
```
