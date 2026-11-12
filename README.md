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

## Beta 0.2.0 — “Sunrise” 🌅

| What | Details |
| --- | --- |
| **A calmer island** | Just four tabs: **Home, Library, Afina, Settings**. **Rest the cursor on the pill and it opens**, with no click and without taking the keyboard from your app; move away and it closes. Click inside and it stays open so you can type. Apple-style touches: a soft light follows the cursor, a rim of light around the edge, a slow glint on the pill, a sliding glass tab selector, springy sizes and content that slides the way you move between tabs. Turn hover-to-open off in Settings → Personalise. |
| **Home: one glance** | A big clock with digits that roll over, the date with a greeting, the weather, what's playing (or one tap for Eternal Radio), what's next in your Planner (or the running timer) and five quick actions: Screenshot, Record, 5-min timer, 25-min focus, Afina. |
| **Library: everything else** | Control centre (Wi-Fi, Bluetooth, dark mode, do not disturb, volume, brightness) and every tool. Weather, Planner, Recordings, Text tools, Timer, Calculator, Translator, Wi-Fi and Radio open inside it. |
| **Cloudy is a real cloud** | He's made of 16 soft, shaded puffs with fluffy edges, lit from above, and tinted by the weather and the time of day. **Click him and he dissolves into vapour**, then puffs back together. He **forms shapes** out of his puffs: heart, star, bunny, cat, fish, music note, umbrella, sun, moon, sheep, the letter E. Often he picks a shape that fits the moment, like a note when music plays, an umbrella in the rain or the moon at night. New moves: smooth stretches, jelly wobble, inflate, flips, roll-overs, yoga, sneezes (achoo, poof!), waves, nuzzles. **With your cursor:** he leans toward it, dodges a cursor that rushes at him, nuzzles one that rests next to him and sometimes chases it to boop it. **With your desktop:** he plays hide-and-seek behind the screen edge, naps melted on the taskbar, bounces off the edges and flies up to wave at the island. Rain, snow and rainbows fall from him. Right-click him for the menu. |
| **Fixes** | Windows can no longer freeze when a window opens from a command. Settings changed in two windows at once no longer undo each other. The self-updater works with paths that contain spaces. A maximised window with an auto-hiding taskbar no longer hides the island as "fullscreen". The media session is reused instead of recreated every second. Brightness checks no longer start PowerShell over and over on displays that can't change it. Screenshots no longer capture the open panel. The pet and settings windows skip weather and Planner downloads. |

## Beta 0.1.1 — “Sunrise” 🌅

| What | Details |
| --- | --- |
| **Cloudy, redesigned** | A minimal, cute cloud with just two eyes and a mouth and 18 expressions. He has lots of body animations: floating, bouncing, a squash when clicked, dangling when grabbed, drooping when bored, leaning in when curious, dancing, sleeping and stretching. He mostly stays at his spot so he doesn't distract you; now and then (rarely by default) he takes a lively trip anywhere on the screen. Drag him to a new spot or throw him and he glides there. **Cloudy's room** (his own window): fullness, happiness, energy and a friendship level; feed him (rainbow, candy, raindrop, sunbeam, snowflake, cookie, star, ice cream: the food flies into his mouth), play ball, tricks, nap; size, speed, how often he wanders and talks, cute sounds. He gets hungry during the day, bored when ignored and sleepy at night. |
| **Library** (new tab next to Home) | A control centre: Wi-Fi (networks and passwords right in the island on Windows), Bluetooth, dark mode, do not disturb, volume and brightness sliders. Tools: **Timer** (presets, your own minutes/seconds, a label, pause/resume, +1 min), Screenshot, Record, Calculator, Translator, Planner, Afina, Cloudy, Weather, Text tools, Lock, Sleep. Plus Eternal Radio. |
| **Screenshots** | **Alt+Shift+S** (changeable), the Library or the tray. Select an area (or the whole screen) and draw on it right away: pen, marker, arrow, line, rectangle, ellipse, text, numbered steps, blur. Undo/redo. **Done** copies it to the clipboard; **Ctrl+S** saves it to *Pictures/Eternal Helper*. Saved at the screen's full resolution. |
| **Eternal Radio** | 8 original instrumental tracks by Eternal Inc. (chill, modern, no vocals): **Sunrise** (this beta's theme), Liquid Glass, Afterglow, Cloud Nine (Cloudy's theme), Deep Focus, Night Drive, Rain on Glass, Eternal. They're composed as code and played by a built-in synthesizer (pads, electric piano, glassy bells, bass, soft drums, rain and vinyl textures, reverb), so they're tiny and royalty-free. A liquid-glass player shows the track in the island. |
| **Afina** | Her default brain now runs **on your computer**: the same engine (WebLLM, Qwen 2.5 / Llama 3.2) Afina uses in Universal Planner. Free, private and offline after a one-time download; no account or key. Or pick an **AI account**: ChatGPT, Claude, Gemini, Perplexity, Copilot or DeepSeek. You sign in once in the service's own window (no API key) and Afina opens it with your question filled in. **Computer tools** (only after you allow them): find files by name, find text inside your documents, open or reveal them, take a screenshot, search the web. |
| **Settings** | Searchable, with a one-line description for every section. A new **Personalise** section, each option with limits: your name (used in greetings), island size (85–115%), text size (90–115%), island opacity (80–100%), 12/24-hour clock and seconds, reduced animations, and which tabs to show (Home and Settings always stay, at least 4 tabs). You can pick your own accent colour; it's adjusted to stay readable. |
| **Smoother** | Tab content cross-fades, the Library's screens slide in, springy buttons, and a welcome for the new release. |

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

- **Afina's on-device brain** needs WebGPU (Windows with WebView2 on a GPU from the last few years; macOS 26 and later in WebKit). Where it's missing, Afina says so and offers the AI accounts. The first download is 0.4–2.3 GB depending on the model.
- **AI accounts** open in their own windows; the answer appears there, not in the island (Eternal Helper doesn't read other sites). ChatGPT, Claude, Perplexity and Copilot get the question filled in; for Gemini and DeepSeek it's copied to the clipboard. Google sign-in may refuse embedded browsers; use email sign-in there.
- **Control centre on macOS:** there's no public API for display brightness or for listing Wi-Fi networks without Location access, so the Mac shows "use the brightness keys" and joins Wi-Fi by name. Bluetooth switches if `blueutil` is installed (`brew install blueutil`), otherwise it opens Bluetooth settings. Dark mode asks once for Automation permission.
- **Control centre on Windows:** brightness works on laptop screens (WMI); external monitors don't expose it.
- **Version naming:** the public name is *Beta 0.2.0 “Sunrise”*; the build number is 0.4.0 so that in-app updates from earlier builds (up to 0.3.1) still see it as newer.
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

## Beta 0.2.0 — «Sunrise» 🌅

- **Спокойный остров:** всего четыре вкладки — **Главная, Библиотека, Афина, Настройки**. **Наведи курсор на пилюлю — и она откроется** сама, без клика и не забирая клавиатуру у твоего приложения; убери курсор — закроется. Кликни внутри — останется открытой, чтобы печатать. Как у Apple: мягкий свет за курсором, светлый ободок, блик на пилюле, стеклянный переключатель вкладок, пружинистые анимации. Отключается в Настройки → Под себя.
- **Главная — одним взглядом:** большие часы, дата с приветствием, погода, что играет (или Eternal Radio в один клик), что дальше в Планере и пять быстрых действий.
- **Библиотека — всё остальное:** центр управления и все инструменты; погода, планер, записи, текст, таймер, калькулятор, переводчик, Wi-Fi и радио открываются прямо в ней.
- **Cloudy — настоящее облако:** 16 мягких объёмных клубов с пушистыми краями. **Кликни — он рассыплется паром** и соберётся снова. Складывается в **фигуры**: сердце, звезда, зайчик, котик, рыбка, нота, зонтик, солнце, луна, овечка, буква E. Новые движения: потягушки, желе, надувается, сальто, кувырки, йога, чихает, машет. **С курсором:** тянется к нему, уворачивается от быстрого, ластится к спокойному, догоняет. **С рабочим столом:** прячется за краем экрана, спит лужицей на панели задач, отскакивает от краёв, летает помахать острову. Из него идёт дождь, снег и радуга. Меню — правый клик.
- **Исправления:** Windows больше не зависает при открытии окон; настройки из двух окон не затирают друг друга; обновление работает с путями с пробелами; развёрнутое окно больше не считается полноэкранным; скриншот не захватывает открытую панель; меньше лишней работы в фоне.

## Beta 0.1.1 — «Sunrise» 🌅

- **Новый Cloudy:** минималистичное милое облачко — только глаза и рот, 18 выражений и много анимаций тела (парит, прыгает, сплющивается от клика, болтается, когда его держат, скучает, любопытничает, танцует, спит). Почти всё время сидит на своём месте и редко улетает в путешествие по всему экрану. **Комната Cloudy:** сытость, настроение, энергия, уровень дружбы, еда (радуга, конфетка, капелька, лучик, снежинка, печенька, звёздочка, мороженое — еда летит прямо в рот), мяч, трюки, сон и все настройки.
- **Библиотека** (новая вкладка рядом с Главной): центр управления — Wi-Fi (сети и пароль прямо в острове на Windows), Bluetooth, тёмная тема, «не беспокоить», громкость и яркость; инструменты — **таймер** (пресеты, свои минуты и секунды, название, пауза, +1 мин), скриншот, запись, калькулятор, переводчик, планер, Афина, Cloudy, погода, текст, блокировка, сон и Eternal Radio.
- **Скриншоты:** Alt+Shift+S — выдели область и сразу рисуй: карандаш, маркер, стрелка, линия, прямоугольник, овал, текст, номера шагов, размытие; «Готово» — в буфер, Ctrl+S — сохранить.
- **Eternal Radio:** 8 оригинальных инструментальных треков Eternal Inc. без слов, включая **«Sunrise»** — тему этой беты; играет встроенный синтезатор.
- **Афина:** мозг на компьютере — тот же движок, что у Афины в Universal Planner (бесплатно, без интернета, без ключа); или вход в ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek без API-ключей; с твоего разрешения ищет файлы и текст в твоих папках, делает скриншоты, ищет в интернете.
- **Настройки:** поиск, описания разделов и новый раздел «Под себя» с ограничениями (имя, размер острова и текста, прозрачность, часы, анимации, вкладки, свой цвет).

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
