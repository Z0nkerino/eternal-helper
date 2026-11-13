//! AI accounts without API keys: ChatGPT, Claude, Gemini, Perplexity, Copilot and DeepSeek open in app
//! windows where the user signs in to their own account on the service's site. Afina can hand a question
//! over: services that accept a prefilled prompt in the URL get it directly; for the others the UI
//! copies it to the clipboard. These windows have no access to the app at all (no IPC permissions).
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct Service {
    pub id: &'static str,
    pub name: &'static str,
    pub home: &'static str,
    /// URL that opens a new chat with the prompt filled in, if the service supports it.
    pub ask: Option<&'static str>,
}

pub const SERVICES: [Service; 6] = [
    Service { id: "chatgpt", name: "ChatGPT", home: "https://chatgpt.com/", ask: Some("https://chatgpt.com/?q=") },
    Service { id: "claude", name: "Claude", home: "https://claude.ai/new", ask: Some("https://claude.ai/new?q=") },
    Service { id: "gemini", name: "Gemini", home: "https://gemini.google.com/app", ask: None },
    Service { id: "perplexity", name: "Perplexity", home: "https://www.perplexity.ai/", ask: Some("https://www.perplexity.ai/search?q=") },
    Service { id: "copilot", name: "Copilot", home: "https://copilot.microsoft.com/", ask: Some("https://copilot.microsoft.com/?q=") },
    Service { id: "deepseek", name: "DeepSeek", home: "https://chat.deepseek.com/", ask: None },
];

pub fn find(id: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.id == id)
}

/// Minimal percent-encoding for a query parameter.
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

/// Opens the service (with the prompt where supported). Returns true when the prompt went in the URL.
pub fn open(app: &AppHandle, id: &str, prompt: Option<&str>) -> Result<bool, String> {
    let s = find(id).ok_or("unknown service")?;
    let url = url_for(s, prompt);
    let prefilled = url != s.home;
    let label = format!("ai-{id}");
    let parsed = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window(&label) {
        if prefilled || prompt.is_none() {
            let _ = w.navigate(parsed);
        }
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(prefilled);
    }
    let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed)).title(format!("{} — Eternal Helper", s.name)).inner_size(980.0, 760.0).min_inner_size(420.0, 520.0).center().additional_browser_args(&crate::webview_args());
    if let Some(ua) = crate::music::user_agent() {
        b = b.user_agent(ua);
    }
    b.build().map_err(|e| e.to_string())?;
    Ok(prefilled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_prompt_urls() {
        assert_eq!(url_for(find("chatgpt").unwrap(), Some("Привет & hi?")), "https://chatgpt.com/?q=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%26%20hi%3F");
        assert_eq!(url_for(find("gemini").unwrap(), Some("hi")), "https://gemini.google.com/app");
        assert_eq!(url_for(find("claude").unwrap(), Some("  ")), "https://claude.ai/new");
    }
}
