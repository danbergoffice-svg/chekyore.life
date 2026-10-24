# Тысячи жизней (рабочее название)

Браузерная игра-симулятор жизни в разных исторических эпохах. Сайт: https://chekyore.life

## Разработка

```bash
npm install
npm run dev      # локальный сервер
npm run build    # сборка в dist/
```

## Публикация

Каждый push в `main` собирается и публикуется на GitHub Pages
(`.github/workflows/deploy.yml`). Домен задаётся файлом `public/CNAME`.
