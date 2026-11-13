//! Eternal Helper — a dynamic island for Windows and macOS. © Eternal Inc.
mod afina;
mod afina_tools;
mod appvol;
mod chats;
mod context;
mod notif;
mod shelf;
mod clipwatch;
mod hud;
mod perf;
mod desk;
mod cloudy;
mod music;
mod planner;
mod platform;
mod recordings;
mod screenshot;
mod secrets;
mod settings;
mod syscontrol;
mod system;
mod updater;
mod windows;

use platform::{FullscreenDetector, MediaAction, MediaInfo, MediaProvider};
use serde::Serialize;
use settings::{Settings, SettingsStore};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;

/// Island window size in logical pixels. The window is transparent and click-through outside the
/// pill, so it can be big enough for the open panel without the window ever resizing.
const ISLAND_W: f64 = 860.0;
const ISLAND_H: f64 = 760.0;

struct AppState {
    settings: SettingsStore,
    planner: Arc<planner::PlannerState>,
    recorder: recordings::RecorderState,
    media: Arc<platform::Media>,
    /// Interactive rectangle per click-through window (logical px, relative to that window):
    /// the island's pill or open panel, and Cloudy himself.
    hit: Mutex<HashMap<String, (f64, f64, f64, f64)>>,
    /// Hidden by the user from the tray (separate from auto-hide in fullscreen).
    user_hidden: AtomicBool,
    last_media: Mutex<Option<MediaInfo>>,
    layout: Mutex<Layout>,
    /// Windows whose page has drawn its first frame (see `window_ready`).
    ready: Mutex<std::collections::HashSet<String>>,
}

type S<'a> = State<'a, AppState>;

fn island(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("island")
}

fn rec_dir(st: &AppState) -> PathBuf {
    recordings::folder(&st.settings.get().recording.folder)
}

// ---------- Window placement ----------

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
struct Layout {
    platform: &'static str,
    /// Notch of the display the island is on right now (None on Windows and notch-less displays).
    notch: Option<platform::Notch>,
    /// Space to leave at the top (macOS menu bar on displays without a notch).
    top_inset: f64,
    native_recording: bool,
    /// Logical width of the island's display, for the safe-area debug overlay.
    screen_width: f64,
    scale: f64,
    /// The island was moved to the lower half of the screen: it opens upward.
    bottom: bool,
    /// The island was moved away from its usual place at the top centre.
    moved: bool,
}

fn layout_for(notch: Option<platform::Notch>, screen_width: f64, scale: f64) -> Layout {
    layout_with(notch, screen_width, scale, None)
}

fn layout_with(notch: Option<platform::Notch>, screen_width: f64, scale: f64, pos: Option<IslandPos>) -> Layout {
    let bottom = pos.is_some_and(|p| p.fy > 0.5);
    let moved = pos.is_some();
    let notch = if moved { None } else { notch };
    Layout {
        bottom,
        moved,
        platform: if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" },
        notch,
        top_inset: if cfg!(target_os = "macos") && notch.is_none() && !moved { 25.0 } else { 0.0 },
        native_recording: platform::native_recording(),
        screen_width,
        scale,
    }
}

/// Centres the island at the top of the monitor under the cursor ("cursor" mode) or the primary one,
/// then recomputes the safe area for that monitor.
fn place(app: &AppHandle, w: &WebviewWindow) {
    let mode = app.state::<AppState>().settings.get().monitor;
    let monitor = if mode == "cursor" {
        w.cursor_position().ok().and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
    } else {
        None
    }
    .or_else(|| w.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return };
    let (pos, size, scale) = (m.position(), m.size(), m.scale_factor());
    let ip = island_pos(&app.state::<AppState>().settings.get());
    let target = match ip {
        // Moved by the user: the pill's top-centre sits at the saved spot (as a share of the screen).
        Some(p) => {
            let (mw, mh) = (size.width as f64 / scale, size.height as f64 / scale);
            // Keep the open panel on screen: its centre stays at least half a panel from the sides.
            let cx = (p.fx * mw).clamp(PANEL_HALF + 8.0, (mw - PANEL_HALF - 8.0).max(PANEL_HALF + 8.0));
            let top = p.fy * mh;
            let y = if p.fy > 0.5 { top + PILL_H - ISLAND_H + 6.0 } else { top - 6.0 };
            PhysicalPosition::new(pos.x + ((cx - ISLAND_W / 2.0) * scale) as i32, pos.y + (y * scale) as i32)
        }
        None => PhysicalPosition::new(pos.x + ((size.width as f64 - ISLAND_W * scale) / 2.0) as i32, pos.y),
    };
    if w.outer_position().ok() != Some(target) {
        let _ = w.set_position(target);
    }
    refresh_layout(app, pos.x as f64 / scale, size.width as f64 / scale, scale, ip);
}

const PILL_H: f64 = 40.0;
const PANEL_HALF: f64 = 340.0;

/// Where the user put the island: the pill's top-centre as a share of the screen (fx, fy in 0..1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IslandPos {
    pub fx: f64,
    pub fy: f64,
}

pub fn island_pos(s: &Settings) -> Option<IslandPos> {
    let v = s.extra.get("islandPos")?;
    let (fx, fy) = (v.get("fx")?.as_f64()?, v.get("fy")?.as_f64()?);
    (fx.is_finite() && fy.is_finite()).then_some(IslandPos { fx: fx.clamp(0.0, 1.0), fy: fy.clamp(0.0, 1.0) })
}

/// Where a dropped pill should stay; None = back to the usual top-centre spot (dropped close to it).
pub fn snap_pos(cx: f64, top: f64, mw: f64, mh: f64) -> Option<IslandPos> {
    if top < 48.0 && (cx - mw / 2.0).abs() < 60.0 {
        return None;
    }
    Some(IslandPos { fx: (cx / mw).clamp(0.0, 1.0), fy: (top.max(0.0) / mh).clamp(0.0, 1.0) })
}

/// Saves where the user dropped the island. `px`, `py`: the pill's top-centre inside the island window.
#[tauri::command]
async fn island_save_pos(app: AppHandle, px: f64, py: f64) -> Result<(), String> {
    let w = island(&app).ok_or("no island")?;
    let m = w.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let scale = m.scale_factor();
    let wp = w.outer_position().map_err(|e| e.to_string())?;
    let cx = (wp.x - m.position().x) as f64 / scale + px;
    let top = (wp.y - m.position().y) as f64 / scale + py;
    let (mw, mh) = (m.size().width as f64 / scale, m.size().height as f64 / scale);
    let st = app.state::<AppState>();
    let mut s = st.settings.get();
    match snap_pos(cx, top, mw, mh) {
        Some(p) => s.extra.insert("islandPos".into(), serde_json::json!({ "fx": p.fx, "fy": p.fy })),
        None => s.extra.remove("islandPos"),
    };
    let s = apply_settings(&app, s)?;
    drop(s);
    place(&app, &w);
    Ok(())
}

/// Measures the notch of the given display (on the main thread, as AppKit requires) and tells the UI
/// when the layout changed, e.g. after moving to an external monitor.
fn refresh_layout(app: &AppHandle, x: f64, width: f64, scale: f64, pos: Option<IslandPos>) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let next = layout_with(platform::notch_for(x, width), width, scale, pos);
        let st = handle.state::<AppState>();
        let mut cur = st.layout.lock().unwrap();
        if *cur != next {
            *cur = next.clone();
            drop(cur);
            let _ = handle.emit("island://layout", &next);
        }
    });
}

// ---------- Background loops ----------

/// Click-through everywhere except the interactive parts (the island's pill/panel, Cloudy). Checks the
/// cursor 25×/s, which costs next to nothing, and only touches a window when its answer changes.
/// Also tells Cloudy where the cursor is (~8×/s, only when it moved) so he can look at it.
fn spawn_hit_test(app: AppHandle) {
    std::thread::spawn(move || {
        let mut ignoring: HashMap<String, bool> = HashMap::new();
        let mut hovering = false;
        let mut last_cursor = (f64::NAN, f64::NAN);
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(40));
            tick = tick.wrapping_add(1);
            let rects = app.state::<AppState>().hit.lock().unwrap().clone();
            let ready = app.state::<AppState>().ready.lock().unwrap().clone();
            for label in ["island", cloudy::LABEL] {
                // Windows not shown yet are left alone (they become click-through when revealed).
                if !ready.contains(label) {
                    ignoring.remove(label);
                    continue;
                }
                let Some(w) = app.get_webview_window(label) else {
                    ignoring.remove(label);
                    continue;
                };
                let (Ok(c), Ok(p), Ok(scale)) = (w.cursor_position(), w.outer_position(), w.scale_factor()) else { continue };
                let (x, y) = ((c.x - p.x as f64) / scale, (c.y - p.y as f64) / scale);
                let inside = rects.get(label).is_some_and(|&(hx, hy, hw, hh)| x >= hx && x <= hx + hw && y >= hy && y <= hy + hh);
                // Re-apply now and then: hiding and showing a window (screenshots do) can reset it.
                if tick % 50 == 0 {
                    ignoring.remove(label);
                }
                if ignoring.get(label) != Some(&!inside) && w.set_ignore_cursor_events(!inside).is_ok() {
                    ignoring.insert(label.to_string(), !inside);
                }
                // The island opens when the cursor rests on it and closes when it leaves. A click-through
                // window gets no mouseleave, so the hover state comes from here.
                if label == "island" && inside != hovering {
                    hovering = inside;
                    let _ = w.emit_to("island", "island://hover", inside);
                }
                if label == cloudy::LABEL && tick % 3 == 0 && (x, y) != last_cursor {
                    last_cursor = (x, y);
                    let _ = w.emit_to(cloudy::LABEL, "cursor://move", (x, y));
                }
            }
        }
    });
}

/// WebView2 options shared by every window (WebView2 needs them identical). Besides Tauri's defaults,
/// screen recording picks the entire screen by itself, with no "what to share" picker, like a game
/// recorder: Chromium selects the source whose name contains this text ("Entire screen" / "Screen 1",
/// or "Весь экран" / "Экран 1" on Russian, Ukrainian or Kazakh Windows).
pub fn webview_args() -> String {
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection".into()
}

/// "Full access" (granted by the user in the app): the island stays above everything, fullscreen apps
/// included, and Afina may open apps. Stored as `fullAccess.granted` in the settings.
pub fn full_access(s: &Settings) -> bool {
    s.extra.get("fullAccess").and_then(|v| v.get("granted")).and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Windows: reads the speakers' peak level while music plays and sends it to the island and Cloudy
/// (`audio://level`, ~25 times a second), so they can move with the beat. Idle when nothing plays.
#[cfg(windows)]
fn spawn_audio_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut meter: Option<syscontrol::Meter> = None;
        let mut retry = 0u32;
        loop {
            let playing = app.state::<AppState>().last_media.lock().unwrap().as_ref().is_some_and(|m| m.playing);
            let wanted = app.state::<AppState>().settings.get().extra.get("liquid").and_then(|v| v.get("beat")).and_then(|v| v.as_bool()).unwrap_or(true);
            if !playing || !wanted {
                std::thread::sleep(Duration::from_millis(500));
                continue;
            }
            if meter.is_none() {
                if retry > 0 {
                    retry -= 1;
                } else {
                    meter = syscontrol::Meter::open();
                    retry = 50; // the default speakers can change: try again in ~2 s if it failed
                }
            }
            match meter.as_ref().and_then(|m| m.peak()) {
                Some(p) => {
                    let _ = app.emit_to("island", "audio://level", p);
                    let _ = app.emit_to(cloudy::LABEL, "audio://level", p);
                }
                None => meter = None,
            }
            std::thread::sleep(Duration::from_millis(40));
        }
    });
}

/// Once a second: hide in fullscreen apps, follow the cursor's monitor.
fn spawn_screen_watch(app: AppHandle) {
    std::thread::spawn(move || {
        platform::init_thread();
        let detector = platform::Fullscreen;
        let mut hidden_for_fullscreen = false;
        let mut streak = 0u8;
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let Some(w) = island(&app) else { continue };
            let st = app.state::<AppState>();
            let s = st.settings.get();
            let priority = full_access(&s);
            // The in-game overlay follows any fullscreen app (whether or not the island hides for it).
            let fullscreen_now = detector.fullscreen_active();
            perf::tick(&app, fullscreen_now && app.get_webview_window(screenshot::LABEL).is_none());
            // With full access the island never hides for fullscreen apps: it is always there.
            let full = s.hide_in_fullscreen && !priority && fullscreen_now;
            // Act only after two identical readings in a row, so a single odd reading never makes the
            // island blink.
            streak = if full != hidden_for_fullscreen { streak.saturating_add(1) } else { 0 };
            let ready = |l: &str| st.ready.lock().unwrap().contains(l);
            if streak >= 2 && ready("island") {
                streak = 0;
                hidden_for_fullscreen = full;
                let cloud = app.get_webview_window(cloudy::LABEL);
                if full {
                    let _ = w.hide();
                    if let Some(c) = &cloud {
                        let _ = c.hide();
                    }
                } else {
                    if !st.user_hidden.load(Ordering::Relaxed) {
                        let _ = w.show();
                    }
                    if let Some(c) = cloud.as_ref().filter(|_| ready(cloudy::LABEL)) {
                        let _ = c.show();
                    }
                }
            }
            // Cheap when nothing changed; follows the cursor's monitor and display changes (lid closed,
            // monitor plugged in) so the notch-safe layout always matches the current screen.
            place(&app, &w);
            tick = tick.wrapping_add(1);
            let editor_open = app.get_webview_window(screenshot::LABEL).is_some();
            if priority && !editor_open {
                // Re-assert the top spot every second, so other always-on-top windows can't cover it.
                platform::raise_topmost(&w);
            } else if tick % 5 == 0 && app.get_webview_window(cloudy::LABEL).is_some() {
                cloudy::keep_island_on_top(&app);
            }
        }
    });
}

/// Polls the system media session and emits `media://changed` only when something visible changed.
fn spawn_media_watch(app: AppHandle) {
    std::thread::spawn(move || {
        platform::init_thread();
        let media = app.state::<AppState>().media.clone();
        // Where the island thinks the track is: the last position sent and when it was sent.
        let mut sent: Option<(u64, std::time::Instant)> = None;
        loop {
            let now = media.now_playing();
            let st = app.state::<AppState>();
            let mut last = st.last_media.lock().unwrap();
            let strip = |m: &Option<MediaInfo>| m.as_ref().map(|m| MediaInfo { position_ms: None, ..m.clone() });
            // Also resend when the real position drifts from the island's estimate (seeking, buffering,
            // a player that reports late), so lyrics and the bar stay in sync.
            let drift = match (&now, sent) {
                (Some(m), Some((at, t))) if m.position_ms.is_some() => {
                    let expected = at + if m.playing { t.elapsed().as_millis() as u64 } else { 0 };
                    m.position_ms.unwrap().abs_diff(expected) > 450
                }
                (Some(m), None) => m.position_ms.is_some(),
                _ => false,
            };
            if strip(&now) != strip(&last) || drift {
                let _ = app.emit("media://changed", &now);
                sent = now.as_ref().and_then(|m| m.position_ms).map(|p| (p, std::time::Instant::now()));
            } else if let (Some(m), Some((at, _))) = (&now, sent) {
                // Paused: keep the estimate pinned so resuming doesn't look like drift.
                if !m.playing {
                    sent = Some((m.position_ms.unwrap_or(at), std::time::Instant::now()));
                }
            }
            *last = now;
            drop(last);
            std::thread::sleep(Duration::from_millis(platform::MEDIA_POLL_MS));
        }
    });
}

// ---------- Hotkey, autostart ----------

fn shot_hotkey(s: &Settings) -> String {
    s.extra.get("shotHotkey").and_then(|v| v.as_str()).unwrap_or("Alt+Shift+S").to_string()
}

/// Registers the island shortcut (opens Afina) and the screenshot shortcut.
fn apply_hotkeys(app: &AppHandle, hotkey: &str, shot: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if !hotkey.trim().is_empty() {
        gs.on_shortcut(hotkey, |app, _sc, ev| {
            if ev.state == ShortcutState::Pressed {
                let _ = app.emit("island://hotkey", ());
            }
        })
        .map_err(|e| format!("This shortcut is taken or not valid: {e}"))?;
    }
    if !shot.trim().is_empty() && shot != hotkey {
        gs.on_shortcut(shot, |app, _sc, ev| {
            if ev.state == ShortcutState::Pressed {
                let a = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = screenshot::start(&a) {
                        let _ = a.emit("island://toast", e);
                    }
                });
            }
        })
        .map_err(|e| format!("The screenshot shortcut is taken or not valid: {e}"))?;
    }
    Ok(())
}

fn apply_autostart(app: &AppHandle, on: bool) {
    let al = app.autolaunch();
    let _ = if on { al.enable() } else { al.disable() };
}

// ---------- Commands ----------

#[tauri::command]
fn get_settings(st: S) -> Settings {
    st.settings.get()
}

/// Applies new settings: shortcuts, autostart, Cloudy's window, monitor; saves and tells every window.
fn apply_settings(app: &AppHandle, value: Settings) -> Result<Settings, String> {
    let st = app.state::<AppState>();
    let old = st.settings.get();
    if value.hotkey != old.hotkey || shot_hotkey(&value) != shot_hotkey(&old) {
        apply_hotkeys(app, &value.hotkey, &shot_hotkey(&value)).inspect_err(|_| {
            let _ = apply_hotkeys(app, &old.hotkey, &shot_hotkey(&old));
        })?;
    }
    if value.autostart != old.autostart {
        apply_autostart(app, value.autostart);
    }
    st.settings.set(value.clone()).map_err(|e| e.to_string())?;
    let cloud_on = cloudy::enabled(&value);
    if cloud_on != cloudy::enabled(&old) {
        cloudy::sync(app, cloud_on);
    }
    if value.recording.folder != old.recording.folder {
        let _ = app.asset_protocol_scope().allow_directory(rec_dir(&app.state::<AppState>()), true);
    }
    if full_access(&value) != full_access(&old) {
        if let Some(w) = island(app) {
            platform::set_priority(&w, full_access(&value));
        }
    }
    if value.monitor != old.monitor || island_pos(&value) != island_pos(&old) {
        if let Some(w) = island(app) {
            place(app, &w);
        }
    }
    let _ = app.emit("settings://changed", &value);
    Ok(value)
}

/// Merges top-level keys into the current settings. Each window sends only what it changed, so two
/// windows saving at the same time can no longer undo each other's changes.
pub fn merge_settings(cur: &Settings, patch: serde_json::Value) -> Result<Settings, String> {
    let mut base = serde_json::to_value(cur).map_err(|e| e.to_string())?;
    let (Some(obj), serde_json::Value::Object(p)) = (base.as_object_mut(), patch) else { return Err("settings patch must be an object".into()) };
    for (k, v) in p {
        obj.insert(k, v);
    }
    serde_json::from_value(base).map_err(|e| format!("invalid settings: {e}"))
}

// Window-creating commands are async: on Windows, building a window inside a synchronous command
// (which runs on the main thread) can deadlock.
#[tauri::command]
async fn set_settings(app: AppHandle, value: Settings) -> Result<Settings, String> {
    apply_settings(&app, value)
}

#[tauri::command]
async fn patch_settings(app: AppHandle, patch: serde_json::Value) -> Result<Settings, String> {
    let next = merge_settings(&app.state::<AppState>().settings.get(), patch)?;
    apply_settings(&app, next)
}

#[tauri::command]
fn island_layout(st: S) -> Layout {
    st.layout.lock().unwrap().clone()
}

#[tauri::command]
fn island_set_hit(window: tauri::Window, st: S, x: f64, y: f64, w: f64, h: f64) {
    st.hit.lock().unwrap().insert(window.label().to_string(), (x, y, w, h));
}

/// The open panel takes keyboard focus (so Afina and text tools can be typed into); the pill never does.
#[tauri::command]
fn island_set_expanded(app: AppHandle, expanded: bool, focus: Option<bool>) {
    if let Some(w) = island(&app) {
        // Opened by hovering: shown without taking the keyboard from the app the user is in.
        platform::set_activatable(&w, expanded && focus.unwrap_or(true));
    }
}

#[tauri::command]
fn media_now(st: S) -> Option<MediaInfo> {
    st.last_media.lock().unwrap().clone()
}

#[tauri::command]
async fn media_seek(app: AppHandle, ms: u64) -> Result<(), String> {
    let media = app.state::<AppState>().media.clone();
    tauri::async_runtime::spawn_blocking(move || {
        platform::init_thread();
        media.seek(ms)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn media_control(app: AppHandle, action: MediaAction) -> Result<(), String> {
    let media = app.state::<AppState>().media.clone();
    tauri::async_runtime::spawn_blocking(move || {
        platform::init_thread();
        media.control(action)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannerInfo {
    webhook_url: String,
    listening: bool,
    recent: Vec<planner::PlannerEvent>,
}

#[tauri::command]
fn planner_info(st: S) -> PlannerInfo {
    let s = st.settings.get().planner;
    PlannerInfo {
        webhook_url: format!("http://127.0.0.1:{}/planner/{}", s.port, s.token),
        listening: st.planner.bound_port.lock().unwrap().is_some(),
        recent: st.planner.recent.lock().unwrap().clone(),
    }
}

#[tauri::command]
async fn planner_snapshot(app: AppHandle) -> Result<planner::PlannerSnapshot, String> {
    let dir = app.state::<AppState>().settings.get().planner.backup_dir;
    tauri::async_runtime::spawn_blocking(move || planner::read_snapshot(&dir)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn planner_open(app: AppHandle) {
    planner::open_planner(&app);
}

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    secrets::set(&name, &value)
}

#[tauri::command]
fn secret_has(name: String) -> bool {
    secrets::get(&name).is_some()
}

#[tauri::command]
async fn afina_ask(app: AppHandle, context: String, history: Vec<afina::ChatMessage>) -> Result<String, String> {
    let cfg = app.state::<AppState>().settings.get().afina;
    tauri::async_runtime::spawn_blocking(move || afina::ask(&cfg, &context, &history)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecInfo {
    folder: String,
    native: bool,
}

#[tauri::command]
fn rec_info(st: S) -> RecInfo {
    RecInfo { folder: rec_dir(&st).to_string_lossy().into_owned(), native: platform::native_recording() }
}

#[tauri::command]
fn rec_begin(st: S, ext: String) -> Result<String, String> {
    st.recorder.begin(&rec_dir(&st), &ext)
}

/// Raw binary body (one MediaRecorder chunk); the recording id comes in the `x-rec-id` header.
#[tauri::command]
fn rec_append(st: S, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let id = request.headers().get("x-rec-id").and_then(|v| v.to_str().ok()).ok_or("missing id")?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => st.recorder.append(id, bytes),
        _ => Err("expected binary chunk".into()),
    }
}

#[tauri::command]
fn rec_finish(app: AppHandle, st: S, id: String, duration_ms: u64, title: Option<String>) -> Result<recordings::Recording, String> {
    let dir = rec_dir(&st);
    let mut rec = st.recorder.finish(&dir, &id, duration_ms)?;
    // An edited copy gets the name it was given ("Trip (edited)").
    if let Some(t) = title.filter(|t| !t.trim().is_empty()) {
        if st.recorder.rename(&dir, &rec.path, &t).is_ok() {
            if let Some(r) = recordings::list(&dir).into_iter().find(|r| r.id == rec.id) {
                rec = r;
            }
        }
    }
    let _ = app.emit("recordings://changed", ());
    Ok(rec)
}

/// A recording's bytes (for the video editor, which needs them as a same-origin blob to cut and export).
#[tauri::command]
async fn rec_read(app: AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let st = app.state::<AppState>();
    if !recordings::list(&rec_dir(&st)).iter().any(|r| r.path == path) {
        return Err("Not a recording".into());
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || std::fs::read(&path)).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Opens a recording in the video editor (trim, mute, snapshot, save a copy).
#[tauri::command]
async fn video_edit(app: AppHandle, path: String) -> Result<(), String> {
    let st = app.state::<AppState>();
    if !recordings::list(&rec_dir(&st)).iter().any(|r| r.path == path) {
        return Err("Not a recording".into());
    }
    windows::open_video_editor(&app, &path)
}

#[tauri::command]
fn rec_cancel(st: S, id: String) {
    st.recorder.cancel(&id);
}

#[tauri::command]
fn rec_native_start(st: S, mic: bool) -> Result<(), String> {
    st.recorder.native_start(&rec_dir(&st), mic)
}

#[tauri::command]
async fn rec_native_stop(app: AppHandle) -> Result<recordings::Recording, String> {
    let a = app.clone();
    let rec = tauri::async_runtime::spawn_blocking(move || {
        let st = a.state::<AppState>();
        st.recorder.native_stop(&rec_dir(&st))
    })
    .await
    .map_err(|e| e.to_string())??;
    let _ = app.emit("recordings://changed", ());
    Ok(rec)
}

#[tauri::command]
fn rec_list(st: S) -> Vec<recordings::Recording> {
    recordings::list(&rec_dir(&st))
}

#[tauri::command]
fn rec_rename(st: S, path: String, title: String) -> Result<(), String> {
    st.recorder.rename(&rec_dir(&st), &path, &title)
}

#[tauri::command]
fn rec_delete(app: AppHandle, st: S, path: String) -> Result<(), String> {
    st.recorder.delete(&rec_dir(&st), &path)?;
    let _ = app.emit("recordings://changed", ());
    Ok(())
}

/// Opens a recording in the system player, after checking it's one of ours.
#[tauri::command]
fn rec_open(app: AppHandle, st: S, path: String, reveal: bool) -> Result<(), String> {
    if !recordings::list(&rec_dir(&st)).iter().any(|r| r.path == path) {
        return Err("Not a recording".into());
    }
    let o = app.opener();
    if reveal { o.reveal_item_in_dir(&path) } else { o.open_path(&path, None::<&str>) }.map_err(|e| e.to_string())
}

#[tauri::command]
fn rec_open_folder(app: AppHandle, st: S) -> Result<(), String> {
    let dir = rec_dir(&st);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_window(app: AppHandle, kind: String) -> Result<(), String> {
    windows::open(&app, &kind)
}

#[tauri::command]
fn battery() -> system::Battery {
    system::battery()
}

#[tauri::command]
async fn update_check() -> Result<updater::UpdateInfo, String> {
    tauri::async_runtime::spawn_blocking(|| updater::check(env!("CARGO_PKG_VERSION"))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let info = updater::check(env!("CARGO_PKG_VERSION"))?;
        match (&info.asset, info.available) {
            (Some(asset), true) => updater::install(&app, asset, &info.latest),
            (None, true) => {
                let _ = app.opener().open_url(updater::RELEASES, None::<&str>);
                Ok(())
            }
            _ => Err("You already have the latest version.".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MusicServiceInfo {
    id: &'static str,
    name: &'static str,
    open: bool,
    visible: bool,
}

#[tauri::command]
fn music_services(app: AppHandle) -> Vec<MusicServiceInfo> {
    music::SERVICES
        .iter()
        .map(|s| {
            let w = app.get_webview_window(&music::label(s.id));
            MusicServiceInfo { id: s.id, name: s.name, open: w.is_some(), visible: w.and_then(|w| w.is_visible().ok()).unwrap_or(false) }
        })
        .collect()
}

#[tauri::command]
async fn music_open(app: AppHandle, service: String, show: bool) -> Result<(), String> {
    music::open(&app, &service, show)
}

#[tauri::command]
fn music_hide(app: AppHandle, service: String) {
    if let Some(w) = app.get_webview_window(&music::label(&service)) {
        let _ = w.hide();
    }
}

#[tauri::command]
fn music_control(app: AppHandle, service: String, action: String) -> Result<(), String> {
    music::control(&app, &service, &action)
}

#[tauri::command]
async fn music_sign_out(app: AppHandle) -> Result<(), String> {
    music::sign_out(&app)?;
    let _ = app.emit("music://changed", music::MusicReport::default());
    Ok(())
}

/// Called by the bridge script inside a music player window (the only command that window may call).
#[tauri::command]
fn music_report(app: AppHandle, window: tauri::Window, report: music::MusicReport) -> Result<(), String> {
    // A player may only speak for its own service.
    if window.label() != music::label(&report.service) {
        return Err("wrong window".into());
    }
    let _ = app.emit("music://changed", report);
    Ok(())
}

// ---------- Screenshots ----------

#[tauri::command]
async fn shot_start(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || screenshot::start(&app)).await.map_err(|e| e.to_string())?
}

/// The captured screen as PNG bytes (binary response, no base64).
#[tauri::command]
fn shot_image(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    screenshot::take_png(&app).map(tauri::ipc::Response::new).ok_or_else(|| "no screenshot".into())
}

/// Saves an edited screenshot (raw PNG body) to Pictures/Eternal Helper and returns the path. Headers:
/// `x-replace: <path>` saves over that screenshot; `x-copy: 1` also puts it on the clipboard.
#[tauri::command]
fn shot_save(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("expected PNG bytes".into()) };
    let replace = request.headers().get("x-replace").and_then(|v| v.to_str().ok()).map(|s| percent_decode(s)).filter(|s| !s.is_empty()).map(std::path::PathBuf::from);
    let path = screenshot::save(bytes, replace.as_deref())?;
    if request.headers().get("x-copy").is_some_and(|v| v == "1") {
        screenshot::copy_png(&app, bytes)?;
    }
    let _ = app.emit("shots://changed", ());
    Ok(path.to_string_lossy().into_owned())
}

/// Header values are ASCII: the path comes percent-encoded.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
fn shot_close(app: AppHandle) {
    screenshot::close(&app);
}

/// What the editor is working on: a fresh capture, or a saved screenshot (its path).
#[tauri::command]
fn shot_info(app: AppHandle) -> Option<String> {
    app.state::<screenshot::ShotState>().editing.lock().unwrap().as_ref().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn shot_list() -> Vec<screenshot::ShotFile> {
    screenshot::list()
}

#[tauri::command]
async fn shot_edit(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || screenshot::edit(&app, std::path::Path::new(&path))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn shot_rename(app: AppHandle, path: String, title: String) -> Result<String, String> {
    let p = screenshot::rename(std::path::Path::new(&path), &title)?;
    let _ = app.emit("shots://changed", ());
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
fn shot_delete(app: AppHandle, path: String) -> Result<(), String> {
    screenshot::delete(std::path::Path::new(&path))?;
    let _ = app.emit("shots://changed", ());
    Ok(())
}

/// Copies a saved screenshot to the clipboard.
#[tauri::command]
async fn shot_copy(app: AppHandle, path: String) -> Result<(), String> {
    if !screenshot::inside_folder(std::path::Path::new(&path)) {
        return Err("That isn't one of your screenshots.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        screenshot::copy_png(&app, &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn shot_open(app: AppHandle, path: String) -> Result<(), String> {
    if !screenshot::inside_folder(std::path::Path::new(&path)) {
        return Err("That isn't one of your screenshots.".into());
    }
    app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn shot_reveal(app: AppHandle, path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).starts_with(screenshot::folder()) {
        return Err("not a screenshot".into());
    }
    app.opener().reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

// ---------- Control centre ----------

#[tauri::command]
async fn controls_read() -> Result<syscontrol::Controls, String> {
    tauri::async_runtime::spawn_blocking(|| {
        platform::init_thread();
        syscontrol::read()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Brightness changes take PowerShell a moment each; while one runs, only the newest value is kept and
/// applied next, so dragging the slider never builds up a queue.
fn set_brightness_latest(level: u8) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, AtomicU8};
    static TARGET: AtomicU8 = AtomicU8::new(255);
    static RUNNING: AtomicBool = AtomicBool::new(false);
    TARGET.store(level, Ordering::SeqCst);
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let mut result = Ok(());
    loop {
        let t = TARGET.swap(255, Ordering::SeqCst);
        if t == 255 {
            break;
        }
        result = syscontrol::set_brightness(t);
    }
    RUNNING.store(false, Ordering::SeqCst);
    // A value that arrived just as we finished.
    if TARGET.load(Ordering::SeqCst) != 255 {
        return set_brightness_latest(TARGET.load(Ordering::SeqCst));
    }
    result
}

#[tauri::command]
async fn controls_set(kind: String, value: serde_json::Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::init_thread();
        let num = || value.as_f64().map(|v| v.clamp(0.0, 100.0) as u8).ok_or("expected a number");
        let flag = || value.as_bool().ok_or("expected true/false");
        match kind.as_str() {
            "volume" => syscontrol::set_volume(num()?),
            "muted" => syscontrol::set_muted(flag()?),
            "brightness" => set_brightness_latest(num()?),
            "dark" => syscontrol::set_dark(flag()?),
            "wifi" => syscontrol::set_wifi(flag()?),
            "bluetooth" => syscontrol::set_bluetooth(flag()?),
            "lock" => syscontrol::lock(),
            "sleep" => syscontrol::sleep(),
            _ => Err("unknown control".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn wifi_networks() -> Result<Vec<syscontrol::Network>, String> {
    tauri::async_runtime::spawn_blocking(syscontrol::networks).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn wifi_connect(ssid: String, password: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || syscontrol::connect(&ssid, password.as_deref().filter(|p| !p.is_empty()))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_system_settings(app: AppHandle, page: String) -> Result<(), String> {
    let url = syscontrol::settings_url(&page).ok_or("unknown page")?;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ---------- Afina: computer tools and AI accounts ----------

fn tools_allowed(app: &AppHandle) -> Result<(), String> {
    if afina_tools::allowed(&app.state::<AppState>().settings.get()) { Ok(()) } else { Err("tools-off".into()) }
}

#[tauri::command]
async fn afina_find_files(app: AppHandle, query: String) -> Result<Vec<afina_tools::Found>, String> {
    tools_allowed(&app)?;
    tauri::async_runtime::spawn_blocking(move || afina_tools::find_files(&afina_tools::roots(), &query, 12)).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn afina_find_text(app: AppHandle, query: String) -> Result<Vec<afina_tools::Found>, String> {
    tools_allowed(&app)?;
    tauri::async_runtime::spawn_blocking(move || afina_tools::find_text(&afina_tools::roots(), &query, 10)).await.map_err(|e| e.to_string())
}

/// Opens an app by name ("Spotify", "Calculator"). Only with full access.
#[tauri::command]
async fn afina_launch(app: AppHandle, name: String) -> Result<(), String> {
    if !full_access(&app.state::<AppState>().settings.get()) {
        return Err("full-access".into());
    }
    tauri::async_runtime::spawn_blocking(move || syscontrol::launch(&name)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn afina_open(app: AppHandle, path: String, reveal: bool) -> Result<(), String> {
    tools_allowed(&app)?;
    if !afina_tools::inside_roots(&afina_tools::roots(), &path) {
        return Err("Afina can only open files in your own folders.".into());
    }
    let o = app.opener();
    if reveal { o.reveal_item_in_dir(&path) } else { o.open_path(&path, None::<&str>) }.map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatServiceInfo {
    id: &'static str,
    name: &'static str,
    prefill: bool,
    kind: &'static str,
}

#[tauri::command]
fn ai_services() -> Vec<ChatServiceInfo> {
    chats::SERVICES.iter().map(|s| ChatServiceInfo { id: s.id, name: s.name, prefill: s.ask.is_some(), kind: s.kind }).collect()
}

/// Shows a chat (AI or messenger) over the open panel, at the panel body's place.
#[tauri::command]
fn chat_show(app: AppHandle, service: String, x: f64, y: f64, w: f64, h: f64, prompt: Option<String>) -> Result<bool, String> {
    chats::show(&app, &service, (x, y, w, h), prompt.as_deref())
}

#[tauri::command]
fn chat_place(app: AppHandle, service: String, x: f64, y: f64, w: f64, h: f64) {
    chats::place(&app, &service, (x, y, w, h));
}

#[tauri::command]
fn chat_hide(app: AppHandle) {
    chats::hide_all(&app);
}

#[tauri::command]
fn chat_focused(app: AppHandle) -> bool {
    chats::focused(&app)
}

#[tauri::command]
fn chat_reload(app: AppHandle, service: String) {
    chats::reload(&app, &service);
}

/// The music app's own volume (0..1), separate from the system volume. None when it can't be read.
#[tauri::command]
async fn music_volume_get(app_name: String) -> Option<f32> {
    tauri::async_runtime::spawn_blocking(move || appvol::get(&app_name)).await.ok().flatten()
}

#[tauri::command]
async fn music_volume_set(app_name: String, level: f32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || appvol::set(&app_name, level)).await.map_err(|e| e.to_string())?
}

/// The app in front and its window title (for Cloudy's remarks).
#[tauri::command]
async fn foreground_app() -> Option<context::Foreground> {
    tauri::async_runtime::spawn_blocking(context::foreground).await.ok().flatten()
}

#[tauri::command]
async fn notif_status() -> String {
    tauri::async_runtime::spawn_blocking(|| {
        platform::init_thread();
        notif::status()
    })
    .await
    .unwrap_or_else(|_| "unsupported".into())
}

#[tauri::command]
async fn notif_request() -> String {
    tauri::async_runtime::spawn_blocking(|| {
        platform::init_thread();
        notif::request()
    })
    .await
    .unwrap_or_else(|_| "unsupported".into())
}

#[tauri::command]
fn shelf_list() -> Vec<shelf::Item> {
    shelf::list()
}

#[tauri::command]
async fn shelf_add(paths: Vec<String>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || shelf::add(&paths)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn files_to_desktop(paths: Vec<String>) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || shelf::to_desktop(&paths)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn shelf_remove(name: String) -> Result<(), String> {
    shelf::remove(&name)
}

#[tauri::command]
fn shelf_open(app: AppHandle, name: String, reveal: bool) -> Result<(), String> {
    let p = if name.is_empty() {
        let d = shelf::dir();
        let _ = std::fs::create_dir_all(&d);
        d
    } else {
        shelf::path(&name)?
    };
    let o = app.opener();
    if reveal && !name.is_empty() { o.reveal_item_in_dir(&p) } else { o.open_path(p.to_string_lossy(), None::<&str>) }.map_err(|e| e.to_string())
}

#[tauri::command]
async fn shelf_export(name: String, to: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || shelf::export(&name, &to)).await.map_err(|e| e.to_string())?
}

/// Shows a finished download in its folder (only files inside Downloads).
#[tauri::command]
fn reveal_download(app: AppHandle, path: String) -> Result<(), String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let p = std::path::Path::new(&path);
    if !p.starts_with(&dir) || path.contains("..") {
        return Err("not a download".into());
    }
    app.opener().reveal_item_in_dir(p).map_err(|e| e.to_string())
}

/// A system notification (Windows Action Center / macOS Notification Centre).
#[tauri::command]
fn desk_list(app: AppHandle) -> Vec<desk::DeskWidget> {
    desk::list(&app)
}

#[tauri::command]
async fn desk_add(app: AppHandle, id: String) -> Result<(), String> {
    desk::add(&app, &id)
}

#[tauri::command]
async fn desk_remove(app: AppHandle, id: String) -> Result<(), String> {
    desk::remove(&app, &id)
}

#[tauri::command]
fn desk_save_pos(app: AppHandle, id: String) -> Result<(), String> {
    desk::save_pos(&app, &id)
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title(title.chars().take(80).collect::<String>()).body(body.chars().take(240).collect::<String>()).show().map_err(|e| e.to_string())
}

#[tauri::command]
fn clip_list(st: tauri::State<'_, clipwatch::ClipState>) -> Vec<clipwatch::Clip> {
    st.items.lock().unwrap().clone()
}

#[tauri::command]
fn clip_delete(st: tauri::State<'_, clipwatch::ClipState>, id: u64) {
    st.items.lock().unwrap().retain(|c| c.id != id);
    st.save();
}

#[tauri::command]
fn clip_pin(st: tauri::State<'_, clipwatch::ClipState>, id: u64, pinned: bool) {
    if let Some(c) = st.items.lock().unwrap().iter_mut().find(|c| c.id == id) {
        c.pinned = pinned;
    }
    st.save();
}

/// Clears the history (pinned items stay).
#[tauri::command]
fn clip_clear(st: tauri::State<'_, clipwatch::ClipState>) {
    st.items.lock().unwrap().retain(|c| c.pinned);
    st.save();
}

/// Opens a web page in the default browser (https only), e.g. a web search Afina was asked for.
#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https links".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Shows a click-through window (the island or Cloudy's layer) once it's ready: when its page reports
/// its first frame, or after 4 s as a fallback.
pub(crate) fn show_when_ready(app: &AppHandle, label: &'static str) {
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        reveal(&a, label);
    });
}

fn reveal(app: &AppHandle, label: &str) {
    let st = app.state::<AppState>();
    if !st.ready.lock().unwrap().insert(label.to_string()) {
        return; // already shown
    }
    let Some(w) = app.get_webview_window(label) else { return };
    if label == "island" && st.user_hidden.load(Ordering::Relaxed) {
        return;
    }
    // Show first, then make it click-through (on Linux the native window must exist first).
    let _ = w.show();
    let _ = w.set_ignore_cursor_events(true);
    if label == cloudy::LABEL {
        cloudy::keep_island_on_top(app);
    }
}

/// Called by each window's page after its first frame is on screen.
#[tauri::command]
fn window_ready(app: AppHandle, window: tauri::Window) {
    let label = window.label().to_string();
    if label == "island" || label == cloudy::LABEL {
        reveal(&app, &label);
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

// ---------- Tray / menu bar ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / hide island", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let videos = MenuItem::with_id(app, "videos", "Open recordings folder", true, None::<&str>)?;
    let planner = MenuItem::with_id(app, "planner", "Open Universal Planner", true, None::<&str>)?;
    let shot = MenuItem::with_id(app, "shot", "Take a screenshot", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "pet", "Cloudy…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Eternal Helper", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle, &shot, &settings, &pet, &videos, &planner, &sep, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main").tooltip("Eternal Helper — Beta 0.1.1 Sunrise").menu(&menu).show_menu_on_left_click(true);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, ev| {
        let st = app.state::<AppState>();
        match ev.id().as_ref() {
            "toggle" => {
                if let Some(w) = island(app) {
                    let hide = w.is_visible().unwrap_or(true);
                    st.user_hidden.store(hide, Ordering::Relaxed);
                    let _ = if hide { w.hide() } else { w.show() };
                }
            }
            "settings" => {
                let _ = windows::open(app, "settings");
            }
            "videos" => {
                let dir = rec_dir(&st);
                let _ = std::fs::create_dir_all(&dir);
                let _ = app.opener().open_path(dir.to_string_lossy(), None::<&str>);
            }
            "planner" => planner::open_planner(app),
            "shot" => {
                let a = app.clone();
                std::thread::spawn(move || {
                    if let Err(e) = screenshot::start(&a) {
                        let _ = a.emit("island://toast", e);
                    }
                });
            }
            "pet" => {
                let _ = windows::open(app, "pet");
            }
            "quit" => app.exit(0),
            _ => {}
        }
    })
    .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patches_only_given_keys() {
        let mut cur = Settings::default();
        cur.language = "ru".into();
        cur.extra.insert("theme".into(), serde_json::json!("glass"));
        let next = merge_settings(&cur, serde_json::json!({ "cloudy": { "enabled": false }, "doNotDisturb": true })).unwrap();
        assert_eq!(next.language, "ru");
        assert!(next.do_not_disturb);
        assert_eq!(next.extra["theme"], "glass");
        assert_eq!(next.extra["cloudy"]["enabled"], false);
        assert!(merge_settings(&cur, serde_json::json!([1])).is_err());
        assert!(merge_settings(&cur, serde_json::json!({ "doNotDisturb": "yes" })).is_err());
    }

    #[test]
    fn decodes_header_paths() {
        assert_eq!(percent_decode("C%3A%5CUsers%5C%D0%98%D0%B2%D0%B0%D0%BD%5Ca.png"), "C:\\Users\\Иван\\a.png");
        assert_eq!(percent_decode("plain%2"), "plain%2");
    }

    #[test]
    fn island_position() {
        assert_eq!(snap_pos(962.0, 10.0, 1920.0, 1080.0), None, "near the top centre: back home");
        let p = snap_pos(300.0, 900.0, 1920.0, 1080.0).unwrap();
        assert!((p.fx - 0.15625).abs() < 1e-9 && p.fy > 0.5);
        let mut s = Settings::default();
        s.extra.insert("islandPos".into(), serde_json::json!({ "fx": 2.0, "fy": 0.2 }));
        assert_eq!(island_pos(&s), Some(IslandPos { fx: 1.0, fy: 0.2 }));
        assert!(layout_with(None, 1920.0, 1.0, Some(IslandPos { fx: 0.5, fy: 0.8 })).bottom);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        // Closing a music player only hides it, so the music keeps playing.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label().starts_with("music-") {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let config_dir = app.path().app_config_dir()?;
            let settings = SettingsStore::load(config_dir);
            let s = settings.get();
            let state = AppState {
                settings,
                planner: Arc::new(planner::PlannerState::default()),
                recorder: recordings::RecorderState::default(),
                media: Arc::new(platform::Media::default()),
                hit: Mutex::new(HashMap::from([("island".to_string(), (ISLAND_W / 2.0 - 100.0, 0.0, 200.0, 40.0))])),
                user_hidden: AtomicBool::new(false),
                last_media: Mutex::new(None),
                layout: Mutex::new(layout_for(None, 0.0, 1.0)),
                ready: Mutex::new(Default::default()),
            };
            let planner_state = state.planner.clone();
            app.manage(state);
            app.manage(screenshot::ShotState::default());
            app.manage(clipwatch::ClipState::load(app.path().app_data_dir()?));
            // Previews of screenshots and recordings in the island (the recordings folder can be custom).
            {
                let scope = app.asset_protocol_scope();
                let _ = std::fs::create_dir_all(screenshot::folder());
                let _ = scope.allow_directory(screenshot::folder(), true);
                let _ = scope.allow_directory(rec_dir(&app.state::<AppState>()), true);
            }

            let handle = app.handle().clone();
            if s.planner.enabled {
                planner::start_server(handle.clone(), planner_state, s.planner.port, s.planner.token.clone());
            }
            if let Err(e) = apply_hotkeys(&handle, &s.hotkey, &shot_hotkey(&s)) {
                log::warn!("{e}");
            }
            build_tray(&handle)?;
            desk::restore(&handle);

            // The island is created here (not in tauri.conf.json) so it gets the same WebView2 options as
            // every other window — WebView2 requires that.
            tauri::WebviewWindowBuilder::new(&handle, "island", tauri::WebviewUrl::App("index.html".into()))
                .title("Eternal Helper")
                .inner_size(ISLAND_W, ISLAND_H)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .visible_on_all_workspaces(true)
                .skip_taskbar(true)
                .resizable(false)
                .shadow(false)
                .focused(false)
                .visible(false)
                .background_color(tauri::webview::Color(0, 0, 0, 0))
                .additional_browser_args(&webview_args())
                .build()?;
            if let Some(w) = island(&handle) {
                platform::style_island(&w);
                platform::set_priority(&w, full_access(&app.state::<AppState>().settings.get()));
                place(&handle, &w);
            }
            // The island appears once its page has drawn (no empty-window flash on Windows).
            show_when_ready(&handle, "island");
            cloudy::sync(&handle, cloudy::enabled(&s));
            spawn_hit_test(handle.clone());
            spawn_screen_watch(handle.clone());
            notif::start(handle.clone());
            #[cfg(windows)]
            spawn_audio_watch(handle.clone());
            clipwatch::spawn(handle.clone());
            hud::spawn(handle.clone());
            spawn_media_watch(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            patch_settings,
            island_layout,
            island_set_hit,
            island_set_expanded,
            media_now,
            media_control,
            planner_info,
            planner_snapshot,
            planner_open,
            secret_set,
            secret_has,
            afina_ask,
            rec_info,
            rec_begin,
            rec_append,
            rec_finish,
            rec_cancel,
            rec_native_start,
            rec_native_stop,
            rec_list,
            rec_rename,
            rec_delete,
            rec_open,
            rec_open_folder,
            open_window,
            battery,
            update_check,
            update_install,
            music_services,
            music_open,
            music_hide,
            music_control,
            music_sign_out,
            music_report,
            shot_start,
            shot_image,
            shot_save,
            shot_close,
            shot_info,
            shot_list,
            shot_edit,
            shot_rename,
            shot_delete,
            shot_copy,
            shot_open,
            rec_read,
            video_edit,
            shot_reveal,
            controls_read,
            controls_set,
            wifi_networks,
            wifi_connect,
            open_system_settings,
            afina_find_files,
            afina_find_text,
            afina_open,
            afina_launch,
            reveal_download,
            island_save_pos,
            notify,
            media_seek,
            desk_list,
            desk_add,
            desk_remove,
            desk_save_pos,
            clip_list,
            clip_delete,
            clip_pin,
            clip_clear,
            ai_services,
            chat_show,
            chat_place,
            chat_hide,
            chat_reload,
            chat_focused,
            music_volume_get,
            music_volume_set,
            foreground_app,
            notif_status,
            notif_request,
            shelf_list,
            shelf_add,
            shelf_remove,
            shelf_open,
            shelf_export,
            files_to_desktop,
            open_url,
            window_ready,
            quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Eternal Helper");
}
