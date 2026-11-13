//! Eternal Helper — a dynamic island for Windows and macOS. © Eternal Inc.
mod afina;
mod afina_tools;
mod ai_accounts;
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
}

fn layout_for(notch: Option<platform::Notch>, screen_width: f64, scale: f64) -> Layout {
    Layout {
        platform: if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" },
        notch,
        top_inset: if cfg!(target_os = "macos") && notch.is_none() { 25.0 } else { 0.0 },
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
    let x = pos.x + ((size.width as f64 - ISLAND_W * scale) / 2.0) as i32;
    let target = PhysicalPosition::new(x, pos.y);
    if w.outer_position().ok() != Some(target) {
        let _ = w.set_position(target);
    }
    refresh_layout(app, pos.x as f64 / scale, size.width as f64 / scale, scale);
}

/// Measures the notch of the given display (on the main thread, as AppKit requires) and tells the UI
/// when the layout changed, e.g. after moving to an external monitor.
fn refresh_layout(app: &AppHandle, x: f64, width: f64, scale: f64) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let next = layout_for(platform::notch_for(x, width), width, scale);
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
            // With full access the island never hides for fullscreen apps: it is always there.
            let full = s.hide_in_fullscreen && !priority && detector.fullscreen_active();
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
            if priority {
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
        loop {
            let now = media.now_playing();
            let st = app.state::<AppState>();
            let mut last = st.last_media.lock().unwrap();
            let strip = |m: &Option<MediaInfo>| m.as_ref().map(|m| MediaInfo { position_ms: None, ..m.clone() });
            if strip(&now) != strip(&last) {
                let _ = app.emit("media://changed", &now);
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
    if full_access(&value) != full_access(&old) {
        if let Some(w) = island(app) {
            platform::set_priority(&w, full_access(&value));
        }
    }
    if value.monitor != old.monitor {
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
fn rec_finish(app: AppHandle, st: S, id: String, duration_ms: u64) -> Result<recordings::Recording, String> {
    let rec = st.recorder.finish(&rec_dir(&st), &id, duration_ms)?;
    let _ = app.emit("recordings://changed", ());
    Ok(rec)
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

/// Saves the edited screenshot (raw PNG body) to Pictures/Eternal Helper and returns the path.
#[tauri::command]
fn shot_save(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => screenshot::save(bytes).map(|p| p.to_string_lossy().into_owned()),
        _ => Err("expected PNG bytes".into()),
    }
}

#[tauri::command]
fn shot_close(app: AppHandle) {
    *app.state::<screenshot::ShotState>().png.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window(screenshot::LABEL) {
        let _ = w.destroy();
    }
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

#[tauri::command]
async fn controls_set(kind: String, value: serde_json::Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform::init_thread();
        let num = || value.as_f64().map(|v| v.clamp(0.0, 100.0) as u8).ok_or("expected a number");
        let flag = || value.as_bool().ok_or("expected true/false");
        match kind.as_str() {
            "volume" => syscontrol::set_volume(num()?),
            "muted" => syscontrol::set_muted(flag()?),
            "brightness" => syscontrol::set_brightness(num()?),
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
struct AiServiceInfo {
    id: &'static str,
    name: &'static str,
    prefill: bool,
}

#[tauri::command]
fn ai_services() -> Vec<AiServiceInfo> {
    ai_accounts::SERVICES.iter().map(|s| AiServiceInfo { id: s.id, name: s.name, prefill: s.ask.is_some() }).collect()
}

#[tauri::command]
async fn ai_open(app: AppHandle, service: String, prompt: Option<String>) -> Result<bool, String> {
    ai_accounts::open(&app, &service, prompt.as_deref())
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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

            let handle = app.handle().clone();
            if s.planner.enabled {
                planner::start_server(handle.clone(), planner_state, s.planner.port, s.planner.token.clone());
            }
            if let Err(e) = apply_hotkeys(&handle, &s.hotkey, &shot_hotkey(&s)) {
                log::warn!("{e}");
            }
            build_tray(&handle)?;

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
            #[cfg(windows)]
            spawn_audio_watch(handle.clone());
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
            ai_services,
            ai_open,
            open_url,
            window_ready,
            quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Eternal Helper");
}
