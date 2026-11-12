# Eternal Helper

**A dynamic island for Windows 10/11 and macOS 13+.** A product of **Eternal Inc.**, made to work with [Universal Planner](https://github.com/Z0nkerino/universal) and **Afina**, the Eternal Inc. assistant.

[Русская версия ниже ↓](#eternal-helper-ru)

An always-visible black pill at the top centre of the screen. It shows the clock and weather, springs open for live activities (music, timers, screen recording, Planner events, Afina thinking), and opens into a panel with tools.

> **Status: basic build (v0.1).** This is the foundation: it builds, runs and is tested. See [What's in this build](#whats-in-this-build) and [Not yet](#not-yet).

## Download

| Platform | Download |
| --- | --- |
| **Windows 10/11** | [Eternal-Helper-windows-setup.exe](https://github.com/Z0nkerino/eternal-helper/releases/latest/download/Eternal-Helper-windows-setup.exe) |
| **macOS 13+** (Apple Silicon + Intel) | [Eternal-Helper-mac.dmg](https://github.com/Z0nkerino/eternal-helper/releases/latest/download/Eternal-Helper-mac.dmg) |

All versions: [Releases](https://github.com/Z0nkerino/eternal-helper/releases).

**Windows, first launch:** the installer isn't code-signed yet, so SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**.

**Mac, first launch:** the app isn't notarized yet (that needs a paid Apple Developer account), so macOS blocks it the first time. Open **System Settings → Privacy & Security** and click **Open Anyway**. Then allow **Screen Recording** when you first record.

New versions: raise `version` in `apps/desktop/src-tauri/tauri.conf.json` and push to `main`. The **Release** workflow builds both installers and publishes them; the links above always point to the newest one.

## What's in this build

| Area | What works |
| --- | --- |
| **Island** | Frameless, transparent, always-on-top window, hidden from the taskbar / Dock, on every desktop / Space. Clicks pass through everywhere except the pill. It springs between rest → live activity → panel; a second activity shows as a side bubble. Toasts slide out from under it. On a MacBook with a notch the pill grows out of the notch. |
| **Afina** | Built into the island (tab + orb in the pill, global shortcut **Alt+Space / ⌥Space**). She handles these herself, in Russian and English: today's Planner tasks, the next event, time/date, weather, timers and focus sessions, starting and stopping screen recordings, maths, fixing the keyboard layout and do-not-disturb. Anything else goes to a language model with **your own key**: Claude (default `claude-opus-5-5`), any OpenAI-compatible API, or a local Ollama. Keys are stored in the system keychain. |
| **Universal Planner connector** | **Live events:** the Planner's *Webhook → Custom* connector posts to the island's local receiver (`127.0.0.1` only, with a secret token), so finished tasks, new events and so on appear in the pill. **Today's tasks:** the island reads the newest backup from the Planner's *Backup folder* connector and shows today's tasks, what's done and upcoming events, in the Planner tab, on Home and to Afina. Plus an **Open Planner** button, which opens the desktop app or falls back to the web app. |
| **Screen recording + library** | Record the screen with no sound, with system sound, or with system sound + microphone. Pause/stop from the pill, with a live timer. Videos are saved to `Videos/Eternal Helper` (`Movies` on Mac, or a folder you choose) and listed in the **Videos** tab: open, show in folder, rename, delete. Files you add to the folder by hand show up too. |
| **Media** | Now playing, with cover art, progress and play/pause/next/previous. Windows: every app that reports to the system (Spotify, browsers, Yandex Music, AIMP…). macOS: Spotify and Apple Music. |
| **Home, Text, Weather** | Quick tools (record, timer, focus, Afina, Planner). Text tools: change case, fix the keyboard layout (ghbdtn → привет), transliterate, clean up text, format JSON, Base64 and URL encode/decode; each result is copied to the clipboard. Weather from Open-Meteo (no key needed). |
| **Notch-safe layout** | On a MacBook with a notch, the notch is a no-go zone. The open panel puts only information beside it (time, weather, what's running) and the tabs go below it, at least 8 px clear. Tabs can sit at the **top, bottom or in a side column** (Settings → Panel tabs; *Auto* = bottom on notched Macs, top elsewhere). Tabs are icons with labels on hover and scroll sideways with faded edges when they don't fit. The notch is measured for the display the island is on, so moving to an external monitor or closing the lid updates the layout. *Settings → For developers → Show safe areas* draws the notch and safe zones over the island. |
| **New in 0.2** | **Fluent 3D emoji** everywhere (toasts, Afina, weather, empty states). **Weather tab** with an animated sky for the weather and time of day, animated Meteocons, live tiles with explanations (humidity, wind, pressure, UV, precipitation, air quality), a 24-hour strip, 7 days with a temperature chart and a sunrise→sunset arc. **Home**: the player tinted with the cover's colour, synced lyrics (LRCLIB) with the current line, recently played; a **Today** card (date, greeting, weather, next event, currency, world clocks, holiday or fact of the day). **Pill carousel** at rest: time + weather → next event → battery → currency → track (order and interval in Settings; mouse wheel switches). **Island themes**: Classic, Liquid Glass, Neon, Minimal + accent colour and corner roundness. |
| **Music accounts** | Sign in to **Spotify, Yandex Music and SoundCloud** in Settings → Music. Each opens the service's official web player in its own window; you log in on the service's page (Eternal Helper never sees the password). The island then shows what plays there and controls it; closing the player keeps the music playing; players can start hidden with the app. Desktop apps of these services are picked up through the system media session without signing in. |
| **Windows** | **Settings in their own window** (sidebar of sections; changes show on the island immediately), and any panel tab can be **popped out** into a window (↗ in the tab bar). |
| **Cloudy** | A living cloud on the desktop: walks along the bottom of the screen, looks at the cursor and steps out of its way, can be dragged and thrown (gravity, bounces), click → menu (nap, call Afina, open the island, turn off), double-click → giggle. Moods: dances to music, turns grey with raindrops when it rains, glows in the sun, rolls his eyes while Afina thinks, jumps with a bell when a timer ends, gets scared on errors, sleeps at night. Occasional speech bubbles (frequency in Settings). Hides in fullscreen apps and while recording. Size, speed and chatter in Settings. |
| **In-app updates** | The app checks GitHub Releases on start and every 6 hours (Settings → Updates: check now, auto-check on/off). One click downloads the new version, verifies its SHA-256 and restarts into it — on Windows by running the installer silently (per-user, no admin), on Mac by swapping the app bundle (the app must be in a folder you can write to, e.g. Applications). Works from 0.2.0 on. |
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
Add `?demo=1` for sample weather and Planner data, `#settings` for the settings window, `#panel/weather` for a popped-out tab, and `#cloudy` (with `?mood=rain|sun|music|think|sleep`) to see Cloudy.
Emulate displays with `?emulate=` (`macbook-air-13`, `macbook-air-15`, `macbook-pro-14`, `macbook-pro-16`, `mac-no-notch`, `external-monitor`, `windows-100`, `windows-150`, `windows-200`), choose the tab position with `&tabs=top|bottom|side` and turn on the safe-area overlay with `&debug=1`. Notch sizes in these presets are approximate; the app itself measures the real notch with `NSScreen`.

### Layout

```
apps/desktop/            Tauri 2 app
  src/                   React + TypeScript UI (island, tabs, Afina, recorder)
  src-tauri/src/         Rust: window, Planner connector, recordings, Afina's model bridge
    platform/            OS code behind traits: win.rs (WinRT/Win32), mac.rs (AppKit), other.rs
packages/ui/             design tokens and basic components
packages/plugin-sdk/     module/plugin API (the built-in tabs use it)
.github/workflows/       ci.yml (tests), release.yml (Windows + Mac installers → GitHub Releases)
```

### CI and signing

`ci.yml` runs the tests on every push. `release.yml` builds and publishes the installers when the version changes. They're unsigned by default. To sign the Mac app, add the repository secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`. The workflow uses each one only if it's set.

## OS limits found so far

- **Music web players:** Spotify's web player uses DRM (Widevine). WebView2 on Windows and WKWebView on Mac may not support it, so Spotify playback *inside the app* can be refused; signing in still works for Yandex Music and SoundCloud, and the Spotify desktop app is always picked up through the system. Pages identify as Safari on Mac so the services accept the embedded browser.
- **In-app updates** use HTTPS + the SHA-256 published in each release. Signature-based updates (`tauri-plugin-updater`) can be switched on once a signing key is added to the repository secrets.
- **Cloudy** walks along the bottom of the primary display for now; walking on the tops of windows (stage 6 of the plan) comes next.

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

## Скачать

- **Windows 10/11:** [Eternal-Helper-windows-setup.exe](https://github.com/Z0nkerino/eternal-helper/releases/latest/download/Eternal-Helper-windows-setup.exe)
- **macOS 13+** (Apple Silicon и Intel): [Eternal-Helper-mac.dmg](https://github.com/Z0nkerino/eternal-helper/releases/latest/download/Eternal-Helper-mac.dmg)

Установщики пока без цифровой подписи. Windows: «Подробнее → Выполнить в любом случае». Mac: **Системные настройки → Конфиденциальность и безопасность → Всё равно открыть**.

## Что есть

- **Раскладка под вырез (notch):** вырез — запретная зона. Рядом с ним в раскрытой панели только информация (время, погода, индикаторы), вкладки — ниже выреза с отступом не меньше 8 px. Расположение вкладок: сверху / снизу / сбоку (Настройки → Вкладки панели; «Авто» — снизу на Mac с вырезом). Отладка: Настройки → Для разработчиков → «Показать безопасные зоны».
- **Новое в 0.2:** цветные 3D-эмодзи Fluent; вкладка «Погода» с живым небом, анимированными иконками, плитками с пояснениями, почасовой лентой, 7 днями с графиком и дугой восхода/заката; карточка «Сегодня» (дата, приветствие, погода, событие, курс валют, мировые часы, праздник или факт дня); плеер в цвет обложки с текстом песни и «недавно играло»; карусель виджетов в пилюле; темы острова (Классика, Liquid Glass, Неон, Минимал), акцентный цвет и скругление.
- **Музыкальные аккаунты:** вход в Spotify, Яндекс Музыку и SoundCloud (Настройки → Музыка) — официальный веб-плеер в окне, пароль приложение не видит; остров показывает трек и управляет им.
- **Окна:** настройки в отдельном окне, любую вкладку панели можно открыть в окне (↗).
- **Cloudy:** живое облачко на рабочем столе — гуляет, смотрит на курсор, его можно бросать, реагирует на музыку, дождь, солнце, таймер, ИИ и ночь, иногда говорит.
- **Обновления в приложении:** проверка при запуске и каждые 6 часов, «Обновить» в один клик (Настройки → Обновления).
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
