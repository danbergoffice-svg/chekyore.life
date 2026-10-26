# Аналитика (ТЗ A1–A2)

Игра шлёт события только через `platform.track(name, params)` (`src/platform/`), игровые счётчики —
`src/telemetry.ts`. Каждое событие уходит в Яндекс Метрику (цель `reachGoal`) и в свой приёмник
(`docs/BACKEND.md`). `choice_made` — только в свой приёмник, чтобы не засорять Метрику.

Общие параметры каждого события: `platform, lang, build, ab, life_index, mode, session_id, player_id`.
Параметры посетителя (userParams): `lives_total, first_seen, best_age`.

| Событие | Параметры | Когда |
|---|---|---|
| app_open | referrer, life_code, load_ms | игра загрузилась |
| life_start | era, region, cls, sex, lottery, protected, generation | герой родился (lottery=heir — наследник) |
| first_choice | sec_from_start | первый выбор в жизни |
| age_milestone | age, sec_in_life | 5, 10, 15, 20, 30, 40, 50, 60, 70 лет |
| choice_made | event_id, option, age, success | любой выбор (только свой приёмник) |
| speed_change | speed | смена скорости |
| tab_open | tab | вкладки жизни, «Читать» справку, графики и запись в итогах |
| session_end | screen, age, sec_in_session | вкладку скрыли/закрыли (sendBeacon) |
| life_end | age, cause, region, era, sec_in_life, choices, rescued, generation | смерть героя |
| summary_action | action: heir/reborn/share/memorial/menu | кнопки итогов |
| share_open / share_done | what / what, format, method | «Поделиться» |
| feedback_sent | rating | отзыв отправлен |
| heir_chosen | generation | продолжение рода |

Позже (этапы 2–4): achievement_unlocked, ad_request/ad_shown/ad_rewarded, challenge_end, portrait_request/portrait_done.

## Настройка Метрики (A2), счётчик 113771699

1. **Цели** (Настройка → Цели → Добавить цель → «JavaScript-событие»), идентификаторы ровно как в таблице:
   `app_open`, `life_start`, `first_choice`, `age_milestone`, `life_end`, `summary_action`, `share_open`,
   `share_done`, `feedback_sent`, `speed_change`, `tab_open`, `session_end`.
2. **Составная цель «Воронка жизни»** (тип «Составная», шаги — JavaScript-события):
   `app_open` → `life_start` → `first_choice` → `age_milestone` → `life_end`.
   Возврат на вторую жизнь — отчёт ниже (параметр life_index=2 у life_start).
3. **Отчёты**: Отчёты → Содержание → Параметры визитов — разбивка по `life_start → era`,
   `life_end → cause`, `age_milestone → age`, `ab`. Отчёт «Параметры посетителей» — `lives_total`, `best_age`.
   Точные воронки по уникальным игрокам и вторую жизнь удобнее смотреть в `/admin` (свой приёмник).
