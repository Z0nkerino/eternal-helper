# Eternal Helper

**A dynamic island for Windows 10/11 and macOS 13+.** A product of **Eternal Inc.**, made to work with [Universal Planner](https://github.com/Z0nkerino/universal) and **Afina**, the Eternal Inc. assistant.

[Русская версия ниже ↓](#eternal-helper-ru)

An always-visible black pill at the top centre of the screen. It shows the clock and weather, springs open for live activities (music, timers, screen recording, Planner events, Afina thinking), and opens into a panel with tools.

> **Status: basic build (v0.1).** This is the foundation: it builds, runs and is tested. See [What's in this build](#whats-in-this-build) and [Not yet](#not-yet).

## What's in this build

| Area | What works |
| --- | --- |
| **Island** | Frameless, transparent, always-on-top window, hidden from the taskbar / Dock, on every desktop / Space. Clicks pass through everywhere except the pill. It springs between rest → live activity → panel; a second activity shows as a side bubble. Toasts slide out from under it. On a MacBook with a notch the pill grows out of the notch. |
| **Afina** | Built into the island (tab + orb in the pill, global shortcut **Alt+Space / ⌥Space**). She handles these herself, in Russian and English: today's Planner tasks, the next event, time/date, weather, timers and focus sessions, starting and stopping screen recordings, maths, fixing the keyboard layout and do-not-disturb. Anything else goes to a language model with **your own key**: Claude (default `claude-opus-5-5`), any OpenAI-compatible API, or a local Ollama. Keys are stored in the system keychain. |
| **Universal Planner connector** | **Live events:** the Planner's *Webhook → Custom* connector posts to the island's local receiver (`127.0.0.1` only, with a secret token), so finished tasks, new events and so on appear in the pill. **Today's tasks:** the island reads the newest backup from the Planner's *Backup folder* connector and shows today's tasks, what's done and upcoming events, in the Planner tab, on Home and to Afina. Plus an **Open Planner** button, which opens the desktop app or falls back to the web app. |
| **Screen recording + library** | Record the screen with no sound, with system sound, or with system sound + microphone. Pause/stop from the pill, with a live timer. Videos are saved to `Videos/Eternal Helper` (`Movies` on Mac, or a folder you choose) and listed in the **Videos** tab: open, show in folder, rename, delete. Files you add to the folder by hand show up too. |
| **Media** | Now playing, with cover art, progress and play/pause/next/previous. Windows: every app that reports to the system (Spotify, browsers, Yandex Music, AIMP…). macOS: Spotify and Apple Music. |
| **Home, Text, Weather** | Quick tools (record, timer, focus, Afina, Planner). Text tools: change case, fix the keyboard layout (ghbdtn → привет), transliterate, clean up text, format JSON, Base64 and URL encode/decode; each result is copied to the clipboard. Weather from Open-Meteo (no key needed). |
| **System** | Tray / menu-bar menu, start at login, a global shortcut you set yourself (shows an error if it's taken), do not disturb, hides in fullscreen apps, follows the cursor's monitor if you want. Russian and English, chosen automatically from the system language. Respects "reduce motion". |

### How to connect Universal Planner (one minute)

1. In Eternal Helper open the island → **Planner** tab → copy the address under *Live events*.
2. In Universal Planner: **Settings → Connectors → Webhook → Custom**, paste the address, tick the events.
3. Optional, for today's tasks: in Universal Planner add the **Backup folder** connector. In Eternal Helper's Planner tab click **Choose folder** and pick the same folder.

Live events need the Planner's desktop app (or a Chromium browser). The backup folder needs a browser with the File System Access API, or the desktop app.

## Develop

Requires Node 20+, pnpm 9 and Rust (stable). Linux also needs `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev`.

```bash
pnpm install
pnpm dev            # runs the island (Tauri dev)
pnpm test           # UI unit tests (Vitest)
pnpm build          # installers for the current OS
```

```bash
cd apps/desktop/src-tauri && cargo test   # Rust unit tests
```

UI only, in a browser, with a built-in mock backend: `pnpm --filter @eternal/desktop dev` → http://localhost:1420.

### Layout

```
apps/desktop/            Tauri 2 app
  src/                   React + TypeScript UI (island, tabs, Afina, recorder)
  src-tauri/src/         Rust: window, Planner connector, recordings, Afina's model bridge
    platform/            OS code behind traits: win.rs (WinRT/Win32), mac.rs (AppKit), other.rs
packages/ui/             design tokens and basic components
packages/plugin-sdk/     module/plugin API (the built-in tabs use it)
.github/workflows/ci.yml tests + Windows (MSI/NSIS) and macOS universal (DMG) builds
```

### CI and signing

CI builds unsigned installers by default. To sign them, add the repository secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (macOS signing and notarization) and `TAURI_SIGNING_PRIVATE_KEY` (+ password) for updates. CI uses each one only if it's set.

## OS limits found so far

- **macOS, media:** Apple closed MediaRemote ("Now Playing" for every app) to third-party apps in macOS 15.4. This build reads **Spotify and Apple Music** through AppleScript; macOS asks for permission once. Adding a `mediaremote-adapter`-based provider is planned.
- **macOS, recording:** this build uses the system `screencapture` tool (needs the Screen Recording permission). Sound: microphone or none; capturing system audio needs ScreenCaptureKit, which comes in a later stage. Pause isn't available with this tool, so the Pause button is hidden on Mac.
- **macOS, window:** the island is a high-level `NSWindow` on all Spaces, kept out of fullscreen Spaces. It isn't a true non-activating `NSPanel` yet, so clicking it briefly activates Eternal Helper (which has no Dock icon).
- **Windows, recording:** uses the system "share screen" picker from WebView2. To include system sound, tick *Share system audio* in that picker.
- **Universal Planner:** it has no inbound API, so the island can't tick off tasks in the Planner yet; data flows one way, from the Planner to the island.

## Not yet

These are planned by stage: clipboard history and command palette search, OCR, screenshot editor, colour picker, QR, Wi-Fi/Bluetooth controls, calendar and other live activities, Claude Code / opencode hooks, characters, sandboxed third-party plugins, a separate settings window and onboarding, auto-updates, "live edge" audio visualiser, island on all monitors at once, SQLite storage.

---

<a id="eternal-helper-ru"></a>

# Eternal Helper (RU)

**«Динамический остров» для Windows 10/11 и macOS 13+.** Продукт **Eternal Inc.** — работает вместе с [Universal Planner](https://github.com/Z0nkerino/universal) и **Afina**, ассистентом Eternal Inc.

Чёрная пилюля по центру сверху экрана: часы и погода, живые активности (музыка, таймер, запись экрана, события Планера, «Afina думает») и панель с инструментами.

> **Статус: базовая версия (v0.1)** — фундамент, который собирается, запускается и покрыт тестами.

## Что есть

- **Остров:** прозрачное окно поверх всех, без иконки в таскбаре/Dock, на всех рабочих столах; клики проходят сквозь всё, кроме пилюли; spring-анимации покой → активность → панель; вторая активность — «пузырь» сбоку; тосты выезжают из острова; на MacBook с вырезом пилюля растёт из выреза.
- **Afina в острове:** вкладка, шар в пилюле и хоткей **Alt+Space / ⌥Space**. Сама отвечает (RU/EN): задачи из Планера на сегодня, ближайшее событие, время, погода, таймер и фокус, старт/стоп записи экрана, калькулятор, раскладка, «не беспокоить». Остальное — через ИИ по вашему ключу: Claude (по умолчанию `claude-opus-5-5`), OpenAI-совместимые API или локальная Ollama. Ключи — в системном хранилище.
- **Подключение к Universal Planner:** живые события через Webhook → Custom на локальный приёмник острова (только `127.0.0.1`, с секретным токеном) и задачи на сегодня из папки резервных копий Планера. Кнопка «Открыть Планер».
- **Запись и хранение видео:** без звука / система / система + микрофон; пауза и стоп прямо в пилюле с таймером; видео сохраняются в `Видео/Eternal Helper` (на Mac — `Фильмы`) или в выбранную папку; вкладка «Записи»: открыть, показать в папке, переименовать, удалить.
- **Медиа, текст, погода, система:** плеер с обложкой; инструменты текста (регистр, раскладка ghbdtn → привет, транслит, чистый текст, JSON, Base64, URL) с копированием результата; погода Open-Meteo; меню в трее, автозапуск, свой хоткей с проверкой конфликта, «не беспокоить», скрытие в полноэкранных приложениях, выбор монитора; русский и английский.

### Подключить Universal Planner

1. Остров → вкладка **Планер** → скопируйте адрес в блоке «Живые события».
2. В Universal Planner: **Настройки → Подключения → Webhook → Custom**, вставьте адрес и отметьте события.
3. Для задач на сегодня: добавьте в Планере подключение **«Папка для копий»** и выберите ту же папку в острове (кнопка «Выбрать папку»).

## Ограничения ОС

- **macOS, медиа:** MediaRemote закрыт для сторонних приложений с macOS 15.4 — сейчас поддерживаются Spotify и Apple Music через AppleScript.
- **macOS, запись:** системная утилита `screencapture` (нужно разрешение «Запись экрана»); звук — микрофон или без звука; системный звук появится со ScreenCaptureKit; пауза на Mac скрыта.
- **macOS, окно:** пока высокоуровневое `NSWindow`, а не `NSPanel` — клик по острову ненадолго активирует приложение.
- **Windows, запись:** системный выбор экрана WebView2; для системного звука включите «Поделиться звуком системы».
- **Universal Planner:** у Планера нет входящего API — остров пока только читает данные, отмечать задачи из острова нельзя.

## Разработка

```bash
pnpm install
pnpm dev     # запуск острова
pnpm test    # тесты UI
pnpm build   # установщик для текущей ОС
```

© 2026 Eternal Inc.
