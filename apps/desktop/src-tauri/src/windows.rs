//! Extra windows: Settings in its own window, and any panel tab "popped out" into a window.
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Panel tabs that may be opened in their own window.
pub const TABS: [&str; 9] = ["home", "music", "library", "ai", "planner", "videos", "text", "weather", "settings"];

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
    let b = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("index.html#{route}").into()))
        .title(title)
        .inner_size(size.0, size.1)
        .min_inner_size(min.0, min.1)
        .center()
        .background_color(tauri::webview::Color(14, 14, 18, 255))
        .theme(Some(tauri::Theme::Dark));
    // Our own dark title bar: frameless with the system shadow and rounded corners on Windows; on macOS
    // the native traffic lights sit over it.
    #[cfg(target_os = "macos")]
    let b = b.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    #[cfg(not(target_os = "macos"))]
    let b = b.decorations(false).shadow(true);
    b.build().map(|_| ()).map_err(|e| e.to_string())
}

/// The video editor for one recording (`path` is checked by the caller).
pub fn open_video_editor(app: &AppHandle, path: &str) -> Result<(), String> {
    let label = "video-edit";
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.destroy();
    }
    let enc: String = path.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect();
    let b = WebviewWindowBuilder::new(app, label, WebviewUrl::App(format!("index.html#video/{enc}").into()))
        .title("Eternal Helper — Video")
        .inner_size(960.0, 680.0)
        .min_inner_size(640.0, 480.0)
        .center()
        .background_color(tauri::webview::Color(14, 14, 18, 255))
        .theme(Some(tauri::Theme::Dark));
    #[cfg(target_os = "macos")]
    let b = b.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
    #[cfg(not(target_os = "macos"))]
    let b = b.decorations(false).shadow(true);
    b.build().map(|_| ()).map_err(|e| e.to_string())
}
