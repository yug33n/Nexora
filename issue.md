---
title: "Каркас проекта: Vite + React + TypeScript"
assignee: "Д (1 курс)"
labels: [setup, infrastructure]
milestone: "Неделя 1 · день 1"
---

# Каркас проекта: Vite + React + TypeScript

## Описание

С этого начинается разработка Nexora. Нужен пустой, но собираемый проект на
Vite + React + TypeScript: конфигурация, точка входа и страница-заглушка.
Capacitor и Android на этом этапе не подключаются — это отдельные задачи.

## Чек-лист

- [ ] `package.json` с зависимостями `react`, `react-dom` и скриптами `dev` / `build`
- [ ] `tsconfig.json` и `tsconfig.node.json` (strict-режим, jsx: react-jsx)
- [ ] `vite.config.ts` с плагином React
- [ ] `index.html` с точкой монтирования `#root`, русская локаль, заголовок «Nexora»
- [ ] `src/vite-env.d.ts` — типы Vite
- [ ] `src/main.tsx` — минимальная точка входа со страницей-заглушкой
- [ ] `.gitignore` (`node_modules/`, `dist/`)

## Критерий приёмки

`npm install && npm run build` проходит без ошибок; `npm run dev` открывает
в браузере страницу с заголовком Nexora.

## Файлы решения

- `package.json` — версия 0.1.0, без Capacitor (он появится в task-10/11)
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- `src/main.tsx`, `src/vite-env.d.ts`, `.gitignore`
