# Тысячи жизней — памятка для новой сессии

Браузерная игра «Тысячи жизней / Thousands of Lives»: одна жизнь в случайной стране и эпохе до эпохи
Великих открытий. Сайт https://thousands.life (Cloudflare Pages). Vite 6 + TypeScript + Preact.
Владелец пишет по-русски — отвечать по-русски, просто и по делу.

## Как развернуть проект из архива

```bash
unzip thousands-project.zip -d ~ && cd ~/chekyore.life   # внутри есть .git со всей историей
npm install
npm test            # ~3–4 мин: контент, симуляция тысяч жизней, калибровка смертности
npm run build       # dist/ + dist/_worker.js (приёмник аналитики)
```

Ветка — `world`. GitHub-аккаунт владельца (danbergoffice-svg) заблокирован: `git push` отвечает 403.
Коммитить локально; если появится новый репозиторий — добавить его как origin и запушить `world`.

## Где что лежит

- `src/engine/` — движок (seed-воспроизводимый): `life.ts` (рождение, наследник, лотерея рождения),
  `game.ts` (год, события, смертность, первый выбор), `rules.ts` (условия, эффекты, вера, имена, «выжил чудом»),
  `report.ts` (итоги жизни), `household.ts` (дом и животные).
- `src/content/` — 13 стран-папок (`era.json`, `ui_ru/en.json` сразу; `events*`, `news*`, `primer*`, `ru*/en*`
  лениво) и `common/` (общие события и тексты). Местное событие с тем же id заменяет общее.
  Правила — `docs/CONTENT_GUIDE.md`, `docs/COUNTRY_PACK.md`, `docs/VARIANTS_BRIEF.md`.
- `src/i18n/` — тексты интерфейса RU/EN; цепочка ключей `key.<регион>` → `key.<вера>` → `key.<группа веры>` →
  `key.<страна>` → `key`; `{g:он|она}` — род героя.
- `src/platform/` — **единственное** место для localStorage/IndexedDB, Метрики, «Поделиться», флагов, языка,
  рекламы и лидербордов (`web.ts`, `yandex.ts` — заглушка до этапа 4). В остальном коде прямых вызовов нет.
- `src/telemetry.ts` — события аналитики игры; список — `docs/ANALYTICS.md`.
- `src/ui/` — экраны Preact; `src/pixel/` — пиксельные сцены и портрет героя (`avatar.ts`: 32×40, возраст, пол,
  телосложение `hero.body` −3…3 от еды/болезней/бедности — считается в `bodyYear` в `game.ts`, причёски, уборы
  и одежда по стилю края и сословию; галерея — `tools/avatars.html?regions=…&ages=…&body=…&zoom=4`).
- `worker/index.ts` — свой приёмник (`/api/events`, `/api/feedback`, `/api/time`, `/api/telegram`, `/admin`,
  `/admin/export`), собирается в `dist/_worker.js` (Pages advanced mode). Расчёты отчётов — `worker/stats.ts`
  (общие для /admin, бота и утренней сводки), бот — `worker/telegram.ts`, отдельный Worker со сводкой по cron —
  `worker/digest/` (`npx wrangler deploy` из папки). Проверка — `npm run test:worker`. Подключение — `docs/BACKEND.md`.
- `public/flags.json` — удалённые настройки (темп года, главы, первая жизнь, A/B); значения по умолчанию —
  `src/platform/types.ts`.
- `tools/` — `check.ts`, `stats.ts` (`npm run stats` после правок контента — иначе падает тест),
  `calibrate.ts` (смертность), `deadly.ts` (CSV смертельных исходов), `og.html` (картинка для соцсетей),
  `gen/first_choice.py` (генератор пула первых выборов), `qa/*.cjs` (проверки в браузере Playwright:
  `npx vite --port 5174` или `npx vite preview --port 4173`, затем `node tools/qa/u.cjs`; снимки в `shots/`).
- Ранние браки по сговору — `common/events_marriage.json` (обручение в детстве, свадьба девочки/мальчика,
  невесту выбирают родители, быт молодой жены); эффект `add_npc` принимает `age_offset`. Доли по странам —
  `npm run marriage -- 300`.
- `docs/TZ.md` (+ `TZ_dorabotka.docx`) — текущее ТЗ; `docs/DECISIONS.md` — принятые решения и отступления.

## Состояние ТЗ (docs/TZ.md)

- **Этап 1 — готов:** B1–B4, U0–U5, A1, A3 (A2 — настройка целей Метрики владельцем по `docs/ANALYTICS.md`).
- **Этап 2 — готов:** P1–P5, B5 (тексты длительности). Отступление: `year_sec` по умолчанию 10, а не 15 —
  иначе не выполняется приёмка «жизнь до 60 лет за 12–18 мин» (см. DECISIONS.md).
- **Сверх ТЗ:** в настройках «Длительность года» — стандартная или 20/30/45/60 с (`prefs.yearSec`).
- **Дальше — этап 3:** ACH1–3 достижения (30 стартовых), M1 детерминированный RNG по подсистемам,
  M2 «Жизнь дня», M3–M5 испытания, M6 главный экран, S1 код жизни, S2 эстафета, S3 динамический OG,
  S4 второй шанс за репост, AI1–AI4 портреты (fal.ai). Затем **этап 4** — сборка для Яндекс Игр
  (`npm run build:yandex`, `src/platform/yandex.ts`).
- Ещё не сделано из ранних просьб: Google-форма отзывов (`tools/google-form.gs`) не настроена — по сути
  заменена своим приёмником.

## Инфраструктура

- Cloudflare Pages: проект сайта на домене thousands.life. Выкладка — архив `dist/` через
  «Create deployment» (или wrangler, если в окружении есть `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`
  и разрешён домен `api.cloudflare.com`).
- D1: база `thousands`, id `4ad2783a-125d-4c26-b8e3-55cf7b6884f1` (EEUR), таблицы `events` и `feedback` созданы.
  Привязка к Pages под именем `DB` и секрет `ADMIN_PASSWORD` делаются в панели Cloudflare (см. BACKEND.md).
- Яндекс Метрика: счётчик 113771699.
- Если сеть окружения не пускает к Cloudflare — собрать `dist`, упаковать в zip и отдать владельцу.

## Привычки работы

- Каждая новая строка интерфейса — сразу в RU и EN; после правок контента `npm run stats`.
- Перед выдачей: `npx tsc --noEmit -p .`, `npm test`, `npm run build`, проверка в браузере на 360–430 px.
- Код в стиле проекта: без точек с запятой, одинарные кавычки, комментарии по-русски.
  **Не запускать prettier** — у проекта нет его конфига, он переформатирует файлы.
- Сохранения: `SAVE_VERSION` в `src/engine/life.ts` + миграции в `src/storage.ts`; мемориал не терять.
