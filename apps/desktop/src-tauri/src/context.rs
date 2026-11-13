//! What's on the screen right now (the app in front and its window title), so Cloudy can talk about it.
//! Read only when Cloudy asks, a few times a minute, and never stored.

#[derive(Clone, Debug, Default, serde::Serialize, PartialEq)]
pub struct Foreground {
    pub app: String,
    pub title: String,
}

#[cfg(windows)]
pub fn foreground() -> Option<Foreground> {
    use ::windows::{
        core::PWSTR,
        Win32::{
            Foundation::CloseHandle,
            System::Threading::{GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
            UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
        },
    };
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid == GetCurrentProcessId() {
            return None;
        }
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(fg, &mut buf);
        let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        let mut app = String::new();
        if let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut name = [0u16; 520];
            let mut len = name.len() as u32;
            if QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(name.as_mut_ptr()), &mut len).is_ok() {
                app = std::path::Path::new(&String::from_utf16_lossy(&name[..len as usize])).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            }
            let _ = CloseHandle(h);
        }
        Some(Foreground { app, title })
    }
}

#[cfg(target_os = "macos")]
pub fn foreground() -> Option<Foreground> {
    let out = std::process::Command::new("osascript")
        .args(["-e", "tell application \"System Events\" to set p to first application process whose frontmost is true", "-e", "set n to name of p", "-e", "try", "-e", "set t to name of front window of p", "-e", "on error", "-e", "set t to \"\"", "-e", "end try", "-e", "return n & \"\u{1f}\" & t"])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let (app, title) = s.split_once('\u{1f}').unwrap_or((&s, ""));
    (!app.is_empty() && app != "eternal-helper" && app != "Eternal Helper").then(|| Foreground { app: app.into(), title: title.into() })
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn foreground() -> Option<Foreground> {
    None
}
