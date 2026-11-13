//! Windows 10/11: GlobalSystemMediaTransportControls for media, the shell's notification state for
//! fullscreen detection, and tool-window styles so the island never shows in the taskbar or steals focus.
use super::*;
use base64::Engine;
use ::windows::{
    Media::Control::{GlobalSystemMediaTransportControlsSessionManager as Manager, GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status},
    Storage::Streams::{DataReader, IRandomAccessStreamReference},
    Win32::{
        Foundation::HWND,
        UI::{
            Shell::{SHQueryUserNotificationState, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN},
            WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW},
        },
    },
};

/// Remembers the last cover so it's read from the system once per track, not every second.
#[derive(Default)]
pub struct Media {
    art: std::sync::Mutex<(String, Option<String>)>,
}

pub const MEDIA_POLL_MS: u64 = 1000;

/// WinRT calls from our background threads need the thread joined to the multithreaded apartment.
pub fn init_thread() {
    unsafe {
        let _ = ::windows::Win32::System::WinRT::RoInitialize(::windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
    }
}

fn read_thumbnail(r: &IRandomAccessStreamReference) -> ::windows::core::Result<String> {
    let stream = r.OpenReadAsync()?.get()?;
    let size = stream.Size()? as u32;
    if size == 0 || size > 4 * 1024 * 1024 {
        return Err(::windows::core::Error::empty());
    }
    let reader = DataReader::CreateDataReader(&stream)?;
    reader.LoadAsync(size)?.get()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf)?;
    let mime = if buf.starts_with(&[0x89, b'P']) { "image/png" } else { "image/jpeg" };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(buf)))
}

/// The media session manager is created once and reused (it was recreated every second before).
fn manager() -> ::windows::core::Result<Manager> {
    use std::sync::Mutex;
    static CACHE: Mutex<Option<Manager>> = Mutex::new(None);
    let mut c = CACHE.lock().unwrap();
    if let Some(m) = c.as_ref() {
        return Ok(m.clone());
    }
    let m = Manager::RequestAsync()?.get()?;
    *c = Some(m.clone());
    Ok(m)
}

fn session() -> ::windows::core::Result<::windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    manager()?.GetCurrentSession()
}

impl MediaProvider for Media {
    fn now_playing(&self) -> Option<MediaInfo> {
        let s = session().ok()?;
        let props = s.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let playing = s.GetPlaybackInfo().ok()?.PlaybackStatus().ok()? == Status::Playing;
        let tl = s.GetTimelineProperties().ok();
        let ms = |d: ::windows::Foundation::TimeSpan| (d.Duration / 10_000).max(0) as u64;
        let title = props.Title().ok()?.to_string();
        if title.is_empty() {
            return None;
        }
        let source = s.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
        let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
        let key = format!("{title}\u{1f}{artist}");
        let artwork = {
            let mut cache = self.art.lock().unwrap();
            if cache.0 != key || cache.1.is_none() {
                *cache = (key, props.Thumbnail().ok().and_then(|t| read_thumbnail(&t).ok()));
            }
            cache.1.clone()
        };
        Some(MediaInfo {
            title,
            artist,
            album: props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default(),
            playing,
            source: friendly_source(&source),
            artwork,
            position_ms: tl.as_ref().and_then(|t| t.Position().ok()).map(ms),
            duration_ms: tl.as_ref().and_then(|t| t.EndTime().ok()).map(ms).filter(|d| *d > 0),
        })
    }

    fn control(&self, action: MediaAction) -> Result<(), String> {
        let s = session().map_err(|e| e.to_string())?;
        let op = match action {
            MediaAction::Toggle => s.TryTogglePlayPauseAsync(),
            MediaAction::Next => s.TrySkipNextAsync(),
            MediaAction::Previous => s.TrySkipPreviousAsync(),
        };
        op.and_then(|o| o.get()).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// "Spotify.exe" / "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify".
fn friendly_source(id: &str) -> String {
    let last = id.rsplit(['!', '\\']).next().unwrap_or(id);
    let base = last.trim_end_matches(".exe");
    match base.to_lowercase().as_str() {
        "msedge" => "Edge".into(),
        "chrome" => "Chrome".into(),
        "firefox" => "Firefox".into(),
        _ => base.to_string(),
    }
}

pub struct Fullscreen;
/// Is another app's window covering the whole monitor (a game, a video, a presentation)?
/// Our own windows never count — Cloudy's layer covers the work area and must not hide the island.
fn foreground_covers_monitor() -> bool {
    use ::windows::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        System::Threading::GetCurrentProcessId,
        UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId},
    };
    unsafe {
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        if pid == GetCurrentProcessId() {
            return false;
        }
        let mut buf = [0u16; 64];
        let n = GetClassNameW(fg, &mut buf).max(0) as usize;
        let class = String::from_utf16_lossy(&buf[..n]);
        // The desktop and the taskbar are not fullscreen apps.
        if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
            return false;
        }
        // A maximised window can cover the whole monitor too (with an auto-hiding taskbar); real fullscreen
        // windows have no title bar.
        let style = ::windows::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(fg, ::windows::Win32::UI::WindowsAndMessaging::GWL_STYLE) as u32;
        if style & ::windows::Win32::UI::WindowsAndMessaging::WS_CAPTION.0 == ::windows::Win32::UI::WindowsAndMessaging::WS_CAPTION.0 {
            return false;
        }
        let mut r = RECT::default();
        if GetWindowRect(fg, &mut r).is_err() {
            return false;
        }
        let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(mon, &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}

impl FullscreenDetector for Fullscreen {
    fn fullscreen_active(&self) -> bool {
        // Exclusive-fullscreen games and presentation mode come from the shell; everything else is a
        // foreground window of another app covering the monitor. QUNS_BUSY is not used: it also fires for
        // borderless windows like Cloudy's layer, which made the island hide and show again.
        let shell = unsafe { SHQueryUserNotificationState() }.map(|s| s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE).unwrap_or(false);
        shell || foreground_covers_monitor()
    }
}

/// Puts a window at the top of the topmost band without activating, moving or redrawing it
/// (switching "always on top" off and on made the island blink).
pub fn raise_topmost(w: &tauri::WebviewWindow) {
    use ::windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOSENDCHANGING};
    if let Ok(h) = w.hwnd() {
        unsafe {
            let _ = SetWindowPos(HWND(h.0 as _), HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOSENDCHANGING);
        }
    }
}

/// Full access: the island is put back on top right away (and then every second by the screen watch).
pub fn set_priority(w: &tauri::WebviewWindow, high: bool) {
    if high {
        raise_topmost(w);
    }
}

pub fn style_island(w: &tauri::WebviewWindow) {
    if let Ok(hwnd) = w.hwnd() {
        let hwnd = HWND(hwnd.0 as _);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | (WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) as isize);
        }
    }
}

/// Cloudy's overlay gets the same tool-window, never-activate styles as the island.
pub fn style_overlay(w: &tauri::WebviewWindow) {
    style_island(w);
}

/// The island is WS_EX_NOACTIVATE so clicks never steal focus; while the panel is open and the user
/// may type (Afina, text tools) we drop the flag and take focus, then restore it on collapse.
/// The screenshot editor is a normal focused topmost window (it takes keyboard input).
pub fn style_shot(_w: &tauri::WebviewWindow) {}

pub fn set_activatable(w: &tauri::WebviewWindow, on: bool) {
    if let Ok(hwnd) = w.hwnd() {
        let hwnd = HWND(hwnd.0 as _);
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let flag = WS_EX_NOACTIVATE.0 as isize;
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, if on { ex & !flag } else { ex | flag });
        }
    }
    if on {
        let _ = w.set_focus();
    }
}

pub fn notch_for(_x: f64, _width: f64) -> Option<Notch> {
    None
}

pub fn native_recording() -> bool {
    false
}

#[cfg(test)]
mod tests {
    #[test]
    fn friendly_names() {
        assert_eq!(super::friendly_source("Spotify.exe"), "Spotify");
        assert_eq!(super::friendly_source("C:\\x\\msedge.exe"), "Edge");
    }
}
