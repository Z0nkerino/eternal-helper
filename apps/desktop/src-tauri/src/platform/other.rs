//! Linux / other: used for development only. MPRIS via `playerctl` if it's installed.
use super::*;
use std::process::Command;

#[derive(Default)]
pub struct Media;

pub const MEDIA_POLL_MS: u64 = 2000;

pub fn init_thread() {}

fn playerctl(args: &[&str]) -> Option<String> {
    let out = Command::new("playerctl").args(args).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

impl MediaProvider for Media {
    fn now_playing(&self) -> Option<MediaInfo> {
        let status = playerctl(&["status"])?;
        let meta = playerctl(&["metadata", "--format", "{{title}}\t{{artist}}\t{{album}}\t{{playerName}}"])?;
        let mut it = meta.split('\t').map(str::to_string);
        Some(MediaInfo {
            title: it.next().unwrap_or_default(),
            artist: it.next().unwrap_or_default(),
            album: it.next().unwrap_or_default(),
            source: it.next().unwrap_or_default(),
            playing: status == "Playing",
            ..Default::default()
        })
        .filter(|m| !m.title.is_empty())
    }

    fn control(&self, action: MediaAction) -> Result<(), String> {
        let arg = match action {
            MediaAction::Toggle => "play-pause",
            MediaAction::Next => "next",
            MediaAction::Previous => "previous",
        };
        playerctl(&[arg]).map(|_| ()).ok_or_else(|| "playerctl not available".into())
    }
}

pub struct Fullscreen;
impl FullscreenDetector for Fullscreen {
    fn fullscreen_active(&self) -> bool {
        false
    }
}

pub fn style_island(_w: &tauri::WebviewWindow) {}

pub fn notch_for(_x: f64, _width: f64) -> Option<Notch> {
    None
}

pub fn native_recording() -> bool {
    false
}

pub fn set_activatable(w: &tauri::WebviewWindow, on: bool) {
    if on {
        let _ = w.set_focus();
    }
}
