# Свой приёмник: аналитика, отзывы, админка

Код — `worker/index.ts`. При `npm run build` он собирается в `dist/_worker.js`, и Cloudflare Pages
запускает его вместе с сайтом (режим «advanced», работает и при загрузке архива через «Create deployment»).
Адреса: `POST /api/events`, `POST /api/feedback`, `HEAD /api/time`, `GET /api/players` (сколько всего игроков заходило —
строка в подвале главного экрана), `POST /api/telegram` (бот), `GET /admin`, `GET /admin/export` (CSV).

`/api/players` не перечитывает всю таблицу событий: уникальные игроки копятся в таблице `players` по новым событиям
(`id` больше прошлой отметки), число и отметка — в таблице `counters` (строка `players`); пересчёт — не чаще раза
в 10 минут, ответ браузер кэширует на 5 минут. Обе таблицы создаются сами (`ensureSchema`).

Файлы: `worker/index.ts` — маршруты и приём; `worker/stats.ts` — все расчёты отчётов (один код для `/admin`,
бота и утренней сводки, поэтому цифры совпадают); `worker/telegram.ts` — бот; `worker/admin.ts` — админка и CSV;
`worker/digest/` — отдельный Worker `thousands-digest` с утренней сводкой. Проверка без Cloudflare:
`npm run test:worker` (локальный SQLite вместо D1, Telegram подменён).

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

## Отчёты в /admin

Все дни считаются **по Стамбулу (UTC+3)**. «7 дней» — сегодня и 6 дней до него, как в командах бота.

- **Сводка за вчера** — ровно то сообщение, что утром приходит в Telegram.
- **Воронка за 7 дней** (как `/funnel`) и **воронка по дням** за 14 дней: уникальные игроки на шагах
  `app_open` → `life_start` → `first_choice` → `age_milestone` (20 лет) → `life_end` → вторая жизнь
  (`life_start` с `life_index ≥ 2`). Шаги считаются независимо (игрок, продолживший старую жизнь, может
  попасть в «Первый выбор» без «Начали жизнь»), поэтому % изредка бывает больше 100.
- **Когорты**: игроки по дню первого события; D1 — сколько из них что-то сделали на следующий день,
  D7 — ровно через 7 дней. «—» — этот день ещё не наступил.
- Игроки и жизни по дням, жизни по режимам, экраны выхода, частота событий, последние 100 отзывов.
- **Скачать CSV** — ссылки вверху страницы: `GET /admin/export?table=events|feedback&days=N`
  (тот же пароль). Файл в UTF-8 с BOM, разделитель «;» — Excel открывает двойным щелчком без кракозябр.
  Для Google Таблиц есть ссылки с запятой (`&sep=comma`); в Таблицах: Файл → Импорт → Загрузить.
  Не больше 50 000 строк (заголовок ответа `x-truncated: 1`, если обрезано) — для большего возьмите меньше дней.
  Колонка `time_istanbul` — время по Стамбулу, `params_json` — все параметры события.

## Telegram: бот и утренняя сводка

Что получится: в чате с ботом команды `/stats` (сегодня и вчера), `/week` (7 дней), `/funnel` (воронка
за 7 дней), `/exits` (топ-10 экранов выхода), `/digest` (утренняя сводка прямо сейчас), `/help`.
Каждый день в 09:00 по Стамбулу бот сам присылает сводку за вчера с дельтой к позавчера.
Бот отвечает только в чате `TELEGRAM_CHAT_ID`; в остальных чатах молчит. Отзывы приходят, как и раньше.

### 1. Придумать секрет webhook

Любая строка 20–60 символов **только из латинских букв, цифр, `_` и `-`** (так требует Telegram).
Например, сгенерировать менеджером паролей без спецсимволов. Это `TELEGRAM_WEBHOOK_SECRET`.
Никому не пересылайте ни его, ни токен бота, не вставляйте их в код и в чаты.

### 2. Секреты в проекте сайта (Pages)

Workers & Pages → проект `thousands-life` → Settings → Variables and Secrets → Add (тип **Secret**),
для Production:

| Имя | Что это |
|---|---|
| `TELEGRAM_TOKEN` | токен бота от @BotFather (уже есть, если отзывы приходят) |
| `TELEGRAM_CHAT_ID` | id вашего чата с ботом (уже есть, если отзывы приходят) |
| `TELEGRAM_WEBHOOK_SECRET` | секрет из шага 1 |

Затем загрузите новую сборку (Create deployment) — секреты применяются к следующему развёртыванию.

### 3. Один раз подключить webhook

Откройте в браузере адрес, подставив свои значения вместо `<ТОКЕН>` и `<СЕКРЕТ>` (угловые скобки убрать):

```
https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://thousands.life/api/telegram&secret_token=<СЕКРЕТ>&allowed_updates=["message"]
```

Ответ `{"ok":true,"result":true,"description":"Webhook was set"}` — готово. Напишите боту `/stats`.
Проверить состояние: `https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo` — поле `last_error_message`
должно отсутствовать. Если там `403 Forbidden` — секрет в Pages и в `setWebhook` не совпадает
или новая сборка не загружена. После этого адрес `.../getUpdates` перестанет работать — это нормально.

### 4. Worker `thousands-digest` (утренняя сводка)

Pages не умеет запускать код по расписанию, поэтому сводку шлёт отдельный маленький Worker из папки
`worker/digest/` (`wrangler.toml` уже настроен: cron `0 6 * * *` UTC = 09:00 по Стамбулу, база `thousands`
под именем `DB`). Нужен Node.js на компьютере. В терминале из корня проекта:

```bash
cd worker/digest
npx wrangler login                                  # один раз: откроется браузер, войдите в Cloudflare
npx wrangler deploy                                 # создаст/обновит Worker thousands-digest
npx wrangler secret put TELEGRAM_TOKEN              # вставьте токен и Enter
npx wrangler secret put TELEGRAM_CHAT_ID            # вставьте chat id
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # тот же секрет из шага 1 (нужен для ручного запуска)
```

Секреты можно добавить и в панели: Workers & Pages → `thousands-digest` → Settings → Variables and Secrets.
Повторный `npx wrangler deploy` нужен только после изменений в `worker/stats.ts`, `worker/telegram.ts`
или `worker/digest/` — секреты при этом сохраняются.

### 5. Проверить сводку, не дожидаясь утра

- Проще всего: напишите боту `/digest` — сайт посчитает и пришлёт ровно тот же текст тем же кодом.
- Запустить сам Worker `thousands-digest`:

  ```bash
  curl -X POST -H "Authorization: Bearer <СЕКРЕТ>" https://thousands-digest.<ваш-поддомен>.workers.dev/run
  ```

  Адрес Worker виден в панели (Workers & Pages → `thousands-digest`, ссылка `*.workers.dev`) и печатается
  после `npx wrangler deploy`. Ответ «Сводка отправлена в Telegram» — сообщение должно прийти.
- Как отработал cron: Workers & Pages → `thousands-digest` → Settings → Trigger Events → View events
  (или вкладка Logs). Если в вашей панели у Cron Triggers есть кнопка запуска — она тоже подойдёт;
  в документации Cloudflare такой кнопки для развёрнутого Worker не описано, поэтому есть `/run` и `/digest`.
- Если за вчера не было ни одного события, придёт «Вчера активности не было» — сводка не молчит.

### Что в сводке

Зашли (уникальные игроки с `app_open`; новые — чьё первое событие вообще было в этот день; остальные —
вернулись), играли (`life_start`, % от зашедших), воронка с % от прошлого шага, топ-5 экранов выхода
(`session_end.screen`: сколько раз, средний возраст героя, средние минуты с открытия вкладки), жизни
(начато, завершено, минуты на жизнь, возраст смерти, выборов за жизнь, по режимам), отзывы (число,
средняя оценка, последний одной строкой) и «Сравнение» ▲/▼ с позавчера по зашли/играли/жизни.

## Что хранится

- `events(ts, player_id, session_id, name, params_json, platform, build)` — события игры (список — `docs/ANALYTICS.md`).
  Индексы: `events_name_ts (name, ts)`, `events_player (player_id)`, `events_ts (ts)` — последний приёмник
  создаёт сам при первом запросе после выкладки.
- `feedback(ts, player_id, rating, answers_json, contact, context_json)` — отзывы.

`player_id` — случайный UUID в браузере игрока, не связан с личностью. IP-адреса не записываются:
они используются только в памяти для ограничения частоты (60 событий и 10 отзывов в минуту с адреса).
Запросы принимаются только с thousands.life, *.pages.dev проекта и доменов Яндекс Игр (CORS).

Если база не подключена, игра работает как обычно: события теряются, отзывы копятся у игрока
и отправляются при следующем запуске.

## Свои запросы

D1 → база `thousands` → Console. Например, отзывы за неделю:

```sql
SELECT datetime(ts/1000 + 10800,'unixepoch') AS time_istanbul, rating, answers_json FROM feedback
WHERE ts > (strftime('%s','now') - 7*86400) * 1000 ORDER BY ts DESC;
```

День по Стамбулу в своих запросах — `date(ts/1000 + 10800, 'unixepoch')`.
