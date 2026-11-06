# TEXNO STORE

Интернет-магазин на Medusa 2.22.3 и Next.js 16.3.8. Основан на официальном Medusa DTC Starter; исходная история и лицензия сохранены.

Витрина, админка и API находятся в одном репозитории. Пункты меню и дерево каталога редактируются в админке. На главной — адаптивный слайдер с прозрачными WebP, преимущества, популярные товары, подборки аксессуаров, рассказ о магазине и отзывы.

## Локальная разработка

Нужны Docker Compose и Node.js 24 при работе вне контейнера. Менеджер пакетов — pnpm 10.11.1.

1. Заполнить `.env` по `.env.template` независимыми локальными секретами.
2. Запустить `docker compose up -d --build`.
3. Витрина: `http://localhost:8000/se`. Админка: `http://localhost:9000/app`.

Существующие данные хранятся в Docker volumes. Подробности — в `LOCAL_SETUP.txt`. Не публиковать `.env`, `.local` и файлы доступов.

## Production

Домен: https://tehnostore.dmitriy-borisenko.ru

Инструкции: [deploy/README.md](deploy/README.md). Используются `Dockerfile.production`, `compose.production.yaml`, отдельные volumes и существующий Traefik с Let's Encrypt. Production-сервисы работают без dev-сервера, polling и монтирования исходников.

## Проверки

- Backend/Admin: `pnpm --filter @dtc/backend build` и `pnpm --filter @dtc/backend lint`.
- Storefront: `pnpm --filter @dtc/storefront build` и `pnpm --filter @dtc/storefront lint`.
- Production-сборка Next проверяет TypeScript; ошибки типов не игнорируются.
- `deploy/verify-storefront.js` — повторяемый сценарий для Playwright CLI `run-code`. Проверяет четыре слайда, размеры, мобильный попап, отзывы, маршруты и отсутствие автосмены во время непрерывной прокрутки с возобновлением после остановки.

## Текущий этап

Товары на главной и в `/catalog` — небольшой сохранённый набор для визуализации. Кнопка «Купить» открывает честный предпросмотр, реальное добавление этих позиций в корзину и онлайн-оплата ещё не подключены. Полный импорт InSales CSV, связь навигации с категориями и редактор HTML-контента — следующие этапы.

Оформление описано в `DESIGN.md`. Промпты и пути иллюстраций сохранены в `hero-artwork-prompts.json` и `story-artwork-prompts.json`.
