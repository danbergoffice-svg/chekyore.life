# Тысячи жизней (рабочее название)

Браузерная игра-симулятор жизни в разных исторических эпохах (Thousands of Lives). Сайт: https://thousands.life

ТЗ: [docs/game_spec.json](docs/game_spec.json), принятые решения: [docs/DECISIONS.md](docs/DECISIONS.md).

## Разработка

```bash
npm install
npm run dev      # локальный сервер
npm run build    # сборка в dist/
```

## Публикация

Каждый push в `main` собирается и публикуется на GitHub Pages
(`.github/workflows/deploy.yml`). Домен задаётся файлом `public/CNAME`.
