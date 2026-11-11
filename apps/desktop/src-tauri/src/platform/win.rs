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
            Shell::{SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN},
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

fn session() -> ::windows::core::Result<::windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    Manager::RequestAsync()?.get()?.GetCurrentSession()
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
impl FullscreenDetector for Fullscreen {
    fn fullscreen_active(&self) -> bool {
        unsafe { SHQueryUserNotificationState() }
            .map(|s| s == QUNS_BUSY || s == QUNS_RUNNING_D3D_FULL_SCREEN || s == QUNS_PRESENTATION_MODE)
            .unwrap_or(false)
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

/// The island is WS_EX_NOACTIVATE so clicks never steal focus; while the panel is open and the user
/// may type (Afina, text tools) we drop the flag and take focus, then restore it on collapse.
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

pub fn notch() -> Option<Notch> {
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
