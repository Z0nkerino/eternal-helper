//! Cloudy, the desktop cloud. Lives in a transparent, click-through window that covers the work area of
//! the primary display (above the taskbar / Dock); only Cloudy itself catches the mouse.
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "cloudy";

pub fn enabled(settings: &crate::settings::Settings) -> bool {
    settings.extra.get("cloudy").and_then(|c| c.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(true)
}

/// Creates or removes Cloudy's window to match the setting.
pub fn sync(app: &AppHandle, on: bool) {
    let existing = app.get_webview_window(LABEL);
    if !on {
        if let Some(w) = existing {
            let _ = w.destroy();
        }
        app.state::<crate::AppState>().ready.lock().unwrap().remove(LABEL);
        return;
    }
    if existing.is_some() {
        return;
    }
    let built = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#cloudy".into()))
        .title("Cloudy")
        .additional_browser_args(&crate::webview_args())
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
        .build();
    let Ok(w) = built else { return };
    if let Ok(Some(m)) = w.primary_monitor() {
        let area = m.work_area();
        let _ = w.set_position(PhysicalPosition::new(area.position.x, area.position.y));
        let _ = w.set_size(PhysicalSize::new(area.size.width, area.size.height));
    }
    crate::platform::style_overlay(&w);
    // Shown by `window_ready` once the page has drawn, so Windows never flashes an empty window.
    crate::show_when_ready(app, LABEL);
}

/// Cloudy's layer covers the whole work area; the island must always stay above it. On macOS the
/// window levels already guarantee that; on Windows/Linux both are "topmost", so re-assert the island.
pub fn keep_island_on_top(app: &AppHandle) {
    if cfg!(target_os = "macos") {
        return;
    }
    if let Some(island) = app.get_webview_window("island") {
        crate::platform::raise_topmost(&island);
    }
}
