//! Clipboard history: every piece of text the user copies, with when and where it came from (the app,
//! the window title and, for browsers, the page's address). Kept on this computer only (clipboard.json in
//! the app's data folder, the newest 100 items). Copies that password managers mark as private are
//! skipped, and history can be paused or cleared at any time.
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

const MAX_ITEMS: usize = 100;
const MAX_LEN: usize = 20_000;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: u64,
    pub text: String,
    /// When it was copied (ms since 1970).
    pub at: u64,
    pub app: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub pinned: bool,
}

pub struct ClipState {
    pub items: Mutex<Vec<Clip>>,
    path: PathBuf,
}

impl ClipState {
    pub fn load(dir: PathBuf) -> Self {
        let path = dir.join("clipboard.json");
        let items = std::fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        Self { items: Mutex::new(items), path }
    }
    pub fn save(&self) {
        let items = self.items.lock().unwrap().clone();
        if let Ok(s) = serde_json::to_string(&items) {
            let _ = std::fs::create_dir_all(self.path.parent().unwrap_or(&self.path));
            let _ = std::fs::write(&self.path, s);
        }
    }
}

/// Where a copy came from.
#[derive(Default, Debug, Clone)]
pub struct Source {
    pub app: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    /// The copying app asked clipboard tools to ignore this (password managers do).
    pub private: bool,
}

/// Adds a copy to the history (newest first). Returns the new item, or None when it is a repeat of the
/// last one or empty. Pinned items are kept when trimming.
pub fn push(items: &mut Vec<Clip>, text: &str, src: &Source, now: u64) -> Option<Clip> {
    let t = text.trim_end_matches(['\r', '\n']);
    if t.trim().is_empty() || items.first().is_some_and(|c| c.text == t) {
        return None;
    }
    let text: String = t.chars().take(MAX_LEN).collect();
    // The same text copied again moves to the top instead of appearing twice.
    let pinned = items.iter().position(|c| c.text == text).map(|i| items.remove(i).pinned).unwrap_or(false);
    let id = items.iter().map(|c| c.id).max().unwrap_or(0) + 1;
    let clip = Clip { id, text, at: now, app: src.app.clone(), title: src.title.clone(), url: src.url.clone(), pinned };
    items.insert(0, clip.clone());
    while items.len() > MAX_ITEMS {
        match items.iter().rposition(|c| !c.pinned) {
            Some(i) => {
                items.remove(i);
            }
            None => break,
        }
    }
    Some(clip)
}

#[allow(dead_code)] // used on Windows only
/// `SourceURL:` from the clipboard's "HTML Format" (what browsers put there when you copy from a page).
pub fn source_url_from_cf_html(html: &str) -> Option<String> {
    html.lines().find_map(|l| l.strip_prefix("SourceURL:")).map(|u| u.trim().to_string()).filter(|u| u.starts_with("http"))
}

pub fn enabled(app: &AppHandle) -> bool {
    let s = app.state::<crate::AppState>().settings.get();
    s.extra.get("clipboard").and_then(|v| v.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(true)
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        crate::platform::init_thread();
        let mut last_seq = sys::sequence();
        let mut last_text = app.clipboard().read_text().ok();
        loop {
            std::thread::sleep(Duration::from_millis(600));
            if !enabled(&app) {
                continue;
            }
            // Cheap change check first (Windows / macOS); elsewhere compare the text itself.
            let seq = sys::sequence();
            if seq.is_some() && seq == last_seq {
                continue;
            }
            last_seq = seq;
            let Ok(text) = app.clipboard().read_text() else { continue };
            if Some(&text) == last_text.as_ref() {
                continue;
            }
            last_text = Some(text.clone());
            let src = sys::source();
            if src.private {
                continue;
            }
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
            let st = app.state::<ClipState>();
            let added = push(&mut st.items.lock().unwrap(), &text, &src, now);
            if let Some(c) = added {
                st.save();
                let _ = app.emit("clip://added", c);
            }
        }
    });
}

#[cfg(windows)]
mod sys {
    use super::Source;
    use ::windows::{
        core::{w, PWSTR},
        Win32::{
            Foundation::{CloseHandle, HANDLE, HGLOBAL, HWND},
            System::{
                DataExchange::{CloseClipboard, GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW},
                Memory::{GlobalLock, GlobalSize, GlobalUnlock},
                Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
            },
            UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
        },
    };

    pub fn sequence() -> Option<u64> {
        Some(unsafe { GetClipboardSequenceNumber() } as u64)
    }

    fn read_format(fmt: u32) -> Option<Vec<u8>> {
        unsafe {
            let h: HANDLE = GetClipboardData(fmt).ok()?;
            let g = HGLOBAL(h.0);
            let p = GlobalLock(g) as *const u8;
            if p.is_null() {
                return None;
            }
            let n = GlobalSize(g);
            let v = std::slice::from_raw_parts(p, n).to_vec();
            let _ = GlobalUnlock(g);
            Some(v)
        }
    }

    pub fn source() -> Source {
        let mut src = Source::default();
        unsafe {
            // The app in front when the copy happened, and its window title.
            let fg = GetForegroundWindow();
            if !fg.0.is_null() {
                let mut buf = [0u16; 512];
                let n = GetWindowTextW(fg, &mut buf);
                if n > 0 {
                    src.title = Some(String::from_utf16_lossy(&buf[..n as usize]));
                }
                let mut pid = 0u32;
                GetWindowThreadProcessId(fg, Some(&mut pid));
                if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                    let mut name = [0u16; 520];
                    let mut len = name.len() as u32;
                    if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(name.as_mut_ptr()), &mut len).is_ok() {
                        let path = String::from_utf16_lossy(&name[..len as usize]);
                        src.app = std::path::Path::new(&path).file_stem().map(|s| super::friendly(&s.to_string_lossy()));
                    }
                    let _ = CloseHandle(h);
                }
            }
            // Clipboard formats: the page address (browsers) and the "keep out of history" markers.
            for _ in 0..5 {
                if OpenClipboard(HWND::default()).is_ok() {
                    let exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
                    let ignore = RegisterClipboardFormatW(w!("Clipboard Viewer Ignore"));
                    src.private = IsClipboardFormatAvailable(exclude).is_ok() || IsClipboardFormatAvailable(ignore).is_ok();
                    let html = RegisterClipboardFormatW(w!("HTML Format"));
                    if !src.private && IsClipboardFormatAvailable(html).is_ok() {
                        if let Some(bytes) = read_format(html) {
                            src.url = super::source_url_from_cf_html(&String::from_utf8_lossy(&bytes));
                        }
                    }
                    let _ = CloseClipboard();
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
        }
        src
    }
}

#[cfg(target_os = "macos")]
mod sys {
    use super::Source;
    use objc2_app_kit::{NSPasteboard, NSWorkspace};
    use objc2_foundation::NSString;

    pub fn sequence() -> Option<u64> {
        Some(NSPasteboard::generalPasteboard().changeCount() as u64)
    }

    pub fn source() -> Source {
        let mut src = Source::default();
        {
            let pb = NSPasteboard::generalPasteboard();
            // Chromium browsers (Chrome, Edge, Arc, Brave) add the page's address.
            if let Some(u) = pb.stringForType(&NSString::from_str("org.chromium.source-url")) {
                src.url = Some(u.to_string()).filter(|u| u.starts_with("http"));
            }
            // Password managers mark private copies with these types.
            for t in ["org.nspasteboard.ConcealedType", "org.nspasteboard.TransientType"] {
                if pb.stringForType(&NSString::from_str(t)).is_some() || pb.dataForType(&NSString::from_str(t)).is_some() {
                    src.private = true;
                }
            }
            if let Some(app) = NSWorkspace::sharedWorkspace().frontmostApplication() {
                src.app = app.localizedName().map(|n| n.to_string());
            }
        }
        src
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod sys {
    pub fn sequence() -> Option<u64> {
        None
    }
    pub fn source() -> super::Source {
        super::Source::default()
    }
}

#[allow(dead_code)] // used on Windows only
/// "msedge" → "Edge", "chrome" → "Chrome"…
pub fn friendly(stem: &str) -> String {
    match stem.to_ascii_lowercase().as_str() {
        "msedge" => "Edge".into(),
        "chrome" => "Chrome".into(),
        "firefox" => "Firefox".into(),
        "opera" | "launcher" => "Opera".into(),
        "browser" => "Yandex Browser".into(),
        "brave" => "Brave".into(),
        "code" => "VS Code".into(),
        "winword" => "Word".into(),
        "excel" => "Excel".into(),
        "explorer" => "Explorer".into(),
        "telegram" => "Telegram".into(),
        "discord" => "Discord".into(),
        "notepad" => "Notepad".into(),
        s => {
            let mut c = s.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_rules() {
        let mut v = vec![];
        let s = Source { app: Some("Chrome".into()), ..Default::default() };
        assert!(push(&mut v, "hello\r\n", &s, 1).is_some());
        assert!(push(&mut v, "hello", &s, 2).is_none(), "same as last");
        assert!(push(&mut v, "   ", &s, 3).is_none(), "blank");
        push(&mut v, "world", &s, 4);
        push(&mut v, "hello", &s, 5);
        assert_eq!(v.iter().map(|c| c.text.as_str()).collect::<Vec<_>>(), ["hello", "world"], "repeat moves to top");
        for i in 0..150 {
            push(&mut v, &format!("t{i}"), &s, 10 + i);
        }
        assert_eq!(v.len(), MAX_ITEMS);
    }

    #[test]
    fn reads_source_url() {
        let html = "Version:0.9\r\nStartHTML:00000097\r\nSourceURL:https://example.com/page?a=1\r\n<html>";
        assert_eq!(source_url_from_cf_html(html).as_deref(), Some("https://example.com/page?a=1"));
        assert_eq!(source_url_from_cf_html("Version:0.9\r\nSourceURL:about:blank\r\n"), None);
        assert_eq!(friendly("msedge"), "Edge");
        assert_eq!(friendly("notion"), "Notion");
    }
}
