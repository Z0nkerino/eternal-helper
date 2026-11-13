//! Desktop widgets: widgets that live on the desktop itself (not in the island) — small frameless windows
//! kept below other windows, like desktop gadgets. Drag one anywhere; where it is is remembered. The
//! list is stored in the settings as `desktopWidgets: [{ id, x, y }]` (logical pixels).
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DeskWidget {
    pub id: String,
    pub x: f64,
    pub y: f64,
}

pub fn label(id: &str) -> String {
    format!("desk-{id}")
}

/// Size of a widget window by its id (matches the widget sizes in the UI, plus room for the frame).
pub fn size_of(id: &str) -> (f64, f64) {
    match id {
        "clock" | "music" | "next" | "fact" => (360.0, 190.0),
        "actions" => (560.0, 190.0),
        "month" => (360.0, 360.0),
        _ => (190.0, 190.0),
    }
}

fn valid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 24 && id.chars().all(|c| c.is_ascii_alphanumeric())
}

pub fn list(app: &AppHandle) -> Vec<DeskWidget> {
    let s = app.state::<crate::AppState>().settings.get();
    s.extra.get("desktopWidgets").and_then(|v| serde_json::from_value::<Vec<DeskWidget>>(v.clone()).ok()).unwrap_or_default().into_iter().filter(|w| valid(&w.id)).collect()
}

fn save(app: &AppHandle, items: &[DeskWidget]) -> Result<(), String> {
    let st = app.state::<crate::AppState>();
    let mut s = st.settings.get();
    s.extra.insert("desktopWidgets".into(), serde_json::to_value(items).map_err(|e| e.to_string())?);
    st.settings.set(s).map_err(|e| e.to_string())
}

pub fn open(app: &AppHandle, w: &DeskWidget) -> Result<(), String> {
    let lbl = label(&w.id);
    if app.get_webview_window(&lbl).is_some() {
        return Ok(());
    }
    let (ww, hh) = size_of(&w.id);
    WebviewWindowBuilder::new(app, &lbl, WebviewUrl::App(format!("index.html#desk/{}", w.id).into()))
        .title("Eternal Helper widget")
        .additional_browser_args(&crate::webview_args())
        .inner_size(ww, hh)
        .position(w.x, w.y)
        .decorations(false)
        .transparent(true)
        .always_on_bottom(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Opens every saved desktop widget (at start-up).
pub fn restore(app: &AppHandle) {
    for w in list(app) {
        let _ = open(app, &w);
    }
}

/// Adds a widget to the desktop, near the top-right of the primary screen, a little below the last one.
pub fn add(app: &AppHandle, id: &str) -> Result<(), String> {
    if !valid(id) {
        return Err("unknown widget".into());
    }
    let mut items = list(app);
    if items.iter().any(|w| w.id == id) {
        return Ok(());
    }
    let (mw, mh) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.size().width as f64 / m.scale_factor(), m.size().height as f64 / m.scale_factor()))
        .unwrap_or((1920.0, 1080.0));
    let (ww, hh) = size_of(id);
    let n = items.len() as f64;
    let w = DeskWidget { id: id.into(), x: (mw - ww - 40.0 - (n * 24.0)).max(0.0), y: (110.0 + n * 40.0).min(mh - hh - 60.0) };
    open(app, &w)?;
    items.push(w);
    save(app, &items)
}

pub fn remove(app: &AppHandle, id: &str) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&label(id)) {
        let _ = w.destroy();
    }
    let items: Vec<_> = list(app).into_iter().filter(|w| w.id != id).collect();
    save(app, &items)
}

/// Remembers where a widget was dragged to.
pub fn save_pos(app: &AppHandle, id: &str) -> Result<(), String> {
    let w = app.get_webview_window(&label(id)).ok_or("no widget")?;
    let scale = w.scale_factor().map_err(|e| e.to_string())?;
    let p = w.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let mut items = list(app);
    if let Some(it) = items.iter_mut().find(|x| x.id == id) {
        it.x = p.x;
        it.y = p.y;
    }
    save(app, &items)
}

#[cfg(test)]
mod tests {
    #[test]
    fn ids_and_sizes() {
        assert!(super::valid("clock"));
        assert!(!super::valid("../x"));
        assert_eq!(super::size_of("month"), (360.0, 360.0));
        assert_eq!(super::size_of("weather"), (190.0, 190.0));
    }
}
