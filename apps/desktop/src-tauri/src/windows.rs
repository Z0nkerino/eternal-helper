//! Extra windows: Settings in its own window, and any panel tab "popped out" into a window.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Panel tabs that may be opened in their own window.
pub const TABS: [&str; 8] = ["home", "library", "afina", "planner", "videos", "text", "weather", "settings"];

pub fn open(app: &AppHandle, kind: &str) -> Result<(), String> {
    let (label, route, title, size, min) = if kind == "pet" {
        ("pet".to_string(), "pet".to_string(), "Cloudy", (440.0, 680.0), (380.0, 560.0))
    } else if kind == "settings" {
        ("settings".to_string(), "settings".to_string(), "Eternal Helper — Settings", (900.0, 660.0), (720.0, 520.0))
    } else if TABS.contains(&kind) {
        (format!("panel-{kind}"), format!("panel/{kind}"), "Eternal Helper", (760.0, 620.0), (480.0, 420.0))
    } else {
        return Err(format!("unknown window: {kind}"));
    };
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("index.html#{route}").into()))
        .title(title)
        .inner_size(size.0, size.1)
        .min_inner_size(min.0, min.1)
        .center()
        .background_color(tauri::webview::Color(14, 14, 16, 255))
        .theme(Some(tauri::Theme::Dark))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
