# Сборка Nexora

## Что понадобится

- Node.js 22.12+ или 24, npm
- Android Studio, JDK 21 для Gradle, Android SDK Platform 35
- При первой сборке — интернет для загрузки зависимостей

## Сборка с нуля

```sh
npm ci          # установка зависимостей из package-lock.json
npm run android:sync   # веб-сборка (tsc + vite) и копирование в android/
npm run android:open   # открытие Android-проекта в Android Studio
```

## Отладочный APK без Android Studio

```sh
cd android
JAVA_HOME=<путь к JDK 21> ANDROID_HOME=<путь к SDK> ./gradlew assembleDebug
```

Готовый файл: `android/app/build/outputs/apk/debug/app-debug.apk`.
Он не коммитится (см. `.gitignore`) — для передачи прикладывается к релизу
на GitHub или копируется в папку `APK/` архива.

## Веб-версия для быстрой проверки

```sh
npm run dev    # http://localhost:5173
```

Данные хранятся в localStorage браузера/WebView, сервер не требуется.
