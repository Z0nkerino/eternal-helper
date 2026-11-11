//! macOS 13+: window level above the menu bar on every Space, notch detection, media via AppleScript.
//!
//! Notes on closed or limited APIs:
//! - MediaRemote (system-wide "Now Playing") is closed to third-party apps since macOS 15.4. This basic
//!   build reads Spotify and Apple Music through AppleScript; a mediaremote-adapter based provider can
//!   be added behind the same MediaProvider trait later.
//! - Fullscreen: the window is not marked FullScreenAuxiliary, so macOS itself keeps it out of
//!   fullscreen Spaces (games, films, presentations). No polling needed.
//! - The island is an NSWindow with a high level, not yet a true non-activating NSPanel; clicking it
//!   briefly activates Eternal Helper (it has no Dock icon). Converting it to NSPanel is a later step.
use super::*;
use objc2_app_kit::{NSScreen, NSWindow, NSWindowCollectionBehavior};
use objc2_foundation::MainThreadMarker;
use std::process::Command;

#[derive(Default)]
pub struct Media;

pub const MEDIA_POLL_MS: u64 = 2000;

pub fn init_thread() {}

const SCRIPT: &str = r#"
on fmt(st, t, ar, al, src, dur, pos, art)
  return st & tab & t & tab & ar & tab & al & tab & src & tab & dur & tab & pos & tab & art
end fmt
set out to ""
if application "Spotify" is running then
  tell application "Spotify"
    if player state is not stopped then
      set out to my fmt(player state as string, name of current track, artist of current track, album of current track, "Spotify", (duration of current track) as string, ((player position * 1000) as integer) as string, artwork url of current track)
      if player state is playing then return out
    end if
  end tell
end if
if application "Music" is running then
  tell application "Music"
    if player state is not stopped then
      return my fmt(player state as string, name of current track, artist of current track, album of current track, "Music", ((duration of current track * 1000) as integer) as string, ((player position * 1000) as integer) as string, "")
    end if
  end tell
end if
return out
"#;

fn osascript(script: &str) -> Option<String> {
    let out = Command::new("/usr/bin/osascript").args(["-e", script]).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn parse_osascript(line: &str) -> Option<MediaInfo> {
    let f: Vec<&str> = line.split('\t').collect();
    if f.len() < 8 || f[1].is_empty() {
        return None;
    }
    Some(MediaInfo {
        playing: f[0] == "playing",
        title: f[1].into(),
        artist: f[2].into(),
        album: f[3].into(),
        source: f[4].into(),
        duration_ms: f[5].parse::<f64>().ok().map(|d| d as u64).filter(|d| *d > 0),
        position_ms: f[6].parse::<f64>().ok().map(|d| d as u64),
        artwork: Some(f[7].to_string()).filter(|a| a.starts_with("https://")),
    })
}

impl MediaProvider for Media {
    fn now_playing(&self) -> Option<MediaInfo> {
        parse_osascript(&osascript(SCRIPT)?)
    }

    fn control(&self, action: MediaAction) -> Result<(), String> {
        let verb = match action {
            MediaAction::Toggle => "playpause",
            MediaAction::Next => "next track",
            MediaAction::Previous => "previous track",
        };
        let app = self.now_playing().map(|m| m.source).unwrap_or_else(|| "Music".into());
        osascript(&format!("tell application \"{app}\" to {verb}")).map(|_| ()).ok_or_else(|| format!("{app} didn't respond"))
    }
}

pub struct Fullscreen;
impl FullscreenDetector for Fullscreen {
    fn fullscreen_active(&self) -> bool {
        false
    }
}

/// Above the menu bar, on every Space, never in the window cycle, no shadow.
pub fn style_island(w: &tauri::WebviewWindow) {
    let Ok(ptr) = w.ns_window() else { return };
    let ptr = ptr as usize;
    let _ = w.run_on_main_thread(move || {
        let win: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        // NSMainMenuWindowLevel is 24; one above it lets the pill sit in the notch area.
        win.setLevel(25);
        win.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::Stationary | NSWindowCollectionBehavior::IgnoresCycle);
        win.setHasShadow(false);
    });
}

pub fn set_activatable(w: &tauri::WebviewWindow, on: bool) {
    if on {
        let _ = w.set_focus();
    }
}

/// Size of the notch on the primary display, if it has one. Must be called on the main thread.
pub fn notch() -> Option<Notch> {
    let mtm = MainThreadMarker::new()?;
    let screens = NSScreen::screens(mtm);
    let screen = screens.firstObject()?;
    let insets = screen.safeAreaInsets();
    if insets.top <= 0.0 {
        return None;
    }
    let left = screen.auxiliaryTopLeftArea();
    let right = screen.auxiliaryTopRightArea();
    let width = screen.frame().size.width - left.size.width - right.size.width;
    (width > 0.0).then_some(Notch { width, height: insets.top })
}

pub fn native_recording() -> bool {
    true
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_now_playing() {
        let m = super::parse_osascript("playing\tSong\tArtist\tAlbum\tSpotify\t200000\t1500\thttps://i.scdn.co/x").unwrap();
        assert!(m.playing);
        assert_eq!(m.duration_ms, Some(200000));
        assert!(super::parse_osascript("").is_none());
    }
}
