//! Chats inside the island: AI services (ChatGPT, Claude, …) and messengers (Telegram, WhatsApp, Discord)
//! load in frameless windows owned by the island and laid exactly over the open panel, so they look and
//! work like part of it. (They used to be extra web views inside the island's own window, but a window
//! with two web views is no longer found as the island, which broke hovering and placement.)
//! The user signs in on the service's own page; these windows get no IPC access at all.
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub struct Service {
    pub id: &'static str,
    pub name: &'static str,
    pub home: &'static str,
    pub ask: Option<&'static str>,
    pub kind: &'static str,
}

pub const SERVICES: [Service; 9] = [
    Service { id: "chatgpt", name: "ChatGPT", home: "https://chatgpt.com/", ask: Some("https://chatgpt.com/?q="), kind: "ai" },
    Service { id: "claude", name: "Claude", home: "https://claude.ai/new", ask: Some("https://claude.ai/new?q="), kind: "ai" },
    Service { id: "gemini", name: "Gemini", home: "https://gemini.google.com/app", ask: None, kind: "ai" },
    Service { id: "perplexity", name: "Perplexity", home: "https://www.perplexity.ai/", ask: Some("https://www.perplexity.ai/search?q="), kind: "ai" },
    Service { id: "copilot", name: "Copilot", home: "https://copilot.microsoft.com/", ask: Some("https://copilot.microsoft.com/?q="), kind: "ai" },
    Service { id: "deepseek", name: "DeepSeek", home: "https://chat.deepseek.com/", ask: None, kind: "ai" },
    Service { id: "telegram", name: "Telegram", home: "https://web.telegram.org/a/", ask: None, kind: "messenger" },
    Service { id: "whatsapp", name: "WhatsApp", home: "https://web.whatsapp.com/", ask: None, kind: "messenger" },
    Service { id: "discord", name: "Discord", home: "https://discord.com/app", ask: None, kind: "messenger" },
];

pub fn find(id: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.id == id)
}

pub fn encode(q: &str) -> String {
    q.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

pub fn url_for(s: &Service, prompt: Option<&str>) -> String {
    match (s.ask, prompt.filter(|p| !p.trim().is_empty())) {
        (Some(base), Some(p)) => format!("{base}{}", encode(p.trim())),
        _ => s.home.to_string(),
    }
}

fn label(id: &str) -> String {
    format!("chat-{id}")
}

/// Where a rect in the island's page (logical pixels) is on the screen (physical pixels).
fn screen_pos(app: &AppHandle, x: f64, y: f64) -> Option<PhysicalPosition<i32>> {
    let isl = app.get_webview_window("island")?;
    let p = isl.inner_position().ok()?;
    let k = isl.scale_factor().ok()?;
    Some(PhysicalPosition::new(p.x + (x * k).round() as i32, p.y + (y * k).round() as i32))
}

fn chats(app: &AppHandle) -> impl Iterator<Item = (String, tauri::WebviewWindow)> {
    app.webview_windows().into_iter().filter(|(l, _)| l.starts_with("chat-"))
}

/// Shows the service over the panel at (x, y, w, h) in the island's logical pixels. Returns true when
/// the prompt went in the URL.
pub fn show(app: &AppHandle, id: &str, rect: (f64, f64, f64, f64), prompt: Option<&str>) -> Result<bool, String> {
    let s = find(id).ok_or("unknown service")?;
    let url = url_for(s, prompt);
    let prefilled = url != s.home;
    let (x, y, w, h) = rect;
    let size = LogicalSize::new(w.max(40.0), h.max(40.0));
    let pos = screen_pos(app, x, y).ok_or("no island")?;
    // Only one chat shows at a time.
    for (l, win) in chats(app) {
        if l != label(id) {
            let _ = win.hide();
        }
    }
    if let Some(win) = app.get_webview_window(&label(id)) {
        if prefilled {
            let _ = win.navigate(url.parse::<tauri::Url>().map_err(|e| e.to_string())?);
        }
        let _ = win.set_size(size);
        let _ = win.set_position(pos);
        let _ = win.show();
        return Ok(prefilled);
    }
    let island = app.get_webview_window("island").ok_or("no island")?;
    let mut b = WebviewWindowBuilder::new(app, label(id), WebviewUrl::External(url.parse::<tauri::Url>().map_err(|e| e.to_string())?))
        .title(format!("{} — Eternal Helper", s.name))
        .additional_browser_args(&crate::webview_args())
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .always_on_top(true)
        .inner_size(size.width, size.height)
        .visible(false)
        // Appearing must not take the focus (that used to close the island before the page loaded).
        .focused(false)
        .background_color(tauri::webview::Color(18, 18, 22, 255))
        // Sign-in pop-ups ("Continue with Google / Apple / Microsoft") must be allowed, or logging in fails.
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Allow)
        .parent(&island)
        .map_err(|e| e.to_string())?;
    if let Some(ua) = crate::music::user_agent() {
        b = b.user_agent(ua);
    }
    let win = b.build().map_err(|e| e.to_string())?;
    // Clicking somewhere else (not the island, not another chat) closes the island, like any panel.
    let handle = app.clone();
    win.on_window_event(move |e| {
        if let tauri::WindowEvent::Focused(false) = e {
            let h = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                let island_focused = h.get_webview_window("island").and_then(|w| w.is_focused().ok()).unwrap_or(false);
                if !focused(&h) && !island_focused {
                    let _ = tauri::Emitter::emit_to(&h, "island", "island://outside", ());
                }
            });
        }
    });
    let _ = win.set_position(pos);
    let _ = win.show();
    Ok(prefilled)
}

/// Follows the panel as it resizes.
pub fn place(app: &AppHandle, id: &str, rect: (f64, f64, f64, f64)) {
    if let (Some(win), Some(pos)) = (app.get_webview_window(&label(id)), screen_pos(app, rect.0, rect.1)) {
        let _ = win.set_size(LogicalSize::new(rect.2.max(40.0), rect.3.max(40.0)));
        let _ = win.set_position(pos);
    }
}

pub fn hide_all(app: &AppHandle) {
    for (_, win) in chats(app) {
        let _ = win.hide();
    }
}

/// Is a chat window the one with the keyboard? (Then the island shouldn't close on losing focus.)
pub fn focused(app: &AppHandle) -> bool {
    chats(app).any(|(_, w)| w.is_focused().unwrap_or(false))
}

/// Reloads the service's home page.
pub fn reload(app: &AppHandle, id: &str) {
    if let (Some(win), Some(s)) = (app.get_webview_window(&label(id)), find(id)) {
        if let Ok(u) = s.home.parse() {
            let _ = win.navigate(u);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn builds_prompt_urls() {
        assert_eq!(url_for(find("chatgpt").unwrap(), Some("Привет & hi?")), "https://chatgpt.com/?q=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%26%20hi%3F");
        assert_eq!(url_for(find("gemini").unwrap(), Some("hi")), "https://gemini.google.com/app");
        assert_eq!(url_for(find("telegram").unwrap(), None), "https://web.telegram.org/a/");
    }
}
