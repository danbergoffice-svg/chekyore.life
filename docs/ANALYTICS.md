# Аналитика (ТЗ A1–A2)

Игра шлёт события только через `platform.track(name, params)` (`src/platform/`), игровые счётчики —
`src/telemetry.ts`. Каждое событие уходит в Яндекс Метрику (цель `reachGoal`) и в свой приёмник
(`docs/BACKEND.md`). `choice_made` — только в свой приёмник, чтобы не засорять Метрику.

Общие параметры каждого события: `platform, lang, build, ab, life_index, mode, session_id, player_id`.
Параметры посетителя (userParams): `lives_total, first_seen, best_age`.

| Событие | Параметры | Когда |
|---|---|---|
| app_open | referrer, life_code, load_ms | игра загрузилась |
| life_start | era, region, cls, sex, lottery, protected, generation, respins | герой родился (lottery=heir — наследник, country — страну выбрал игрок; protected — жизнь защищена до 20 лет; respins — сколько раз перекрутил барабан) |
| respin | n, era, cls | перекрутил барабан после результата (n — какая по счёту перекрутка; era, cls — что выпало до неё) |
| first_choice | sec_from_start | первый выбор в жизни |
| age_milestone | age, sec_in_life | 5, 10, 15, 20, 30, 40, 50, 60, 70 лет |
| choice_made | event_id, option, age, success | любой выбор (только свой приёмник) |
| speed_change | speed | смена скорости |
| tab_open | tab | вкладки жизни, «Читать» справку, графики и запись в итогах; `settings_from_hint` — открыл настройки из подсказки о длительности года |
| session_end | screen, age, sec_in_session | вкладку скрыли/закрыли (sendBeacon) |
| life_end | age, cause, region, era, sec_in_life, choices, rescued, generation | смерть героя |
| summary_action | action: heir/reborn/share/memorial/menu | кнопки итогов |
| share_open / share_done | what (life/dream) / what, format, method | «Поделиться» жизнью или сном |
| feedback_sent | rating | отзыв отправлен |
| heir_chosen | generation | продолжение рода |
| dream_offer | dream, era, age | герою приснился сон о будущем (docs/TZ_dreams.md); в первой жизни — наверняка к 25 годам |
| country_pick | era | пробный период: игрок после отзыва выбрал страну следующих жизней |
| dream_start / dream_skip | dream | «Попробовать вспомнить» / «Это просто сон» |
| dream_step | dream, step, kind, correct (0/1), value (до 80 знаков), sec | ответ на шаге сна (только свой приёмник; отчёт «Сны о будущем» в `/admin`) |
| dream_end | dream, score, outcome (breakthrough/partial/failure/death), hint_used, known | сон кончился |
| dream_training / dream_training_end | dream / dream, score, hint_used | тренировка сна из «Школьной программы»; её `dream_step` идут с `training: 1` и в отчёт `/admin` не попадают |
| achievement_unlocked | id, rare (1 — секретная, трудная или у <5% игроков) | получена награда (ТЗ v3, п. 10) |

Позже (этапы 2–4): ad_request/ad_shown/ad_rewarded, challenge_end, portrait_request/portrait_done.

## Настройка Метрики (A2), счётчик 113771699

1. **Цели** (Настройка → Цели → Добавить цель → «JavaScript-событие»), идентификаторы ровно как в таблице:
   `app_open`, `life_start`, `first_choice`, `age_milestone`, `life_end`, `summary_action`, `share_open`,
   `share_done`, `feedback_sent`, `speed_change`, `tab_open`, `session_end`, `dream_offer`, `dream_start`, `dream_end`.
2. **Составная цель «Воронка жизни»** (тип «Составная», шаги — JavaScript-события):
   `app_open` → `life_start` → `first_choice` → `age_milestone` → `life_end`.
   Возврат на вторую жизнь — отчёт ниже (параметр life_index=2 у life_start).
3. **Отчёты**: Отчёты → Содержание → Параметры визитов — разбивка по `life_start → era`,
   `life_end → cause`, `age_milestone → age`, `ab`. Отчёт «Параметры посетителей» — `lives_total`, `best_age`.
   Точные воронки по уникальным игрокам и вторую жизнь удобнее смотреть в `/admin` (свой приёмник),
   в Telegram-боте (`/stats`, `/week`, `/funnel`, `/exits`) и в утренней сводке — см. `docs/BACKEND.md`.

## Как параметры читаются в отчётах (/admin, бот, сводка)

- `life_index` и `mode` у `life_start`/`life_end` — общие параметры (setContext), а не свои; вторая жизнь —
  `life_start` с `life_index ≥ 2` (наследник тоже считается).
- Возраст смерти — `life_end.age`, выборов за жизнь — `life_end.choices`, длительность — `life_end.sec_in_life`.
- `session_end` уходит при **каждом** скрытии вкладки, поэтому за визит их может быть несколько;
  `sec_in_session` — секунды с загрузки страницы (а не с прошлого скрытия), `age` — возраст текущего героя
  (0, если героя ещё нет, например на `menu` при первом заходе).
