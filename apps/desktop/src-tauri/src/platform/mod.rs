//! Everything OS-specific sits behind these traits. The UI only sees Tauri commands and events.
use serde::Serialize;

#[derive(Clone, Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub playing: bool,
    /// App that owns the session, e.g. "Spotify".
    pub source: String,
    /// data: URL of the cover, when the system provides one.
    pub artwork: Option<String>,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaAction {
    Toggle,
    Next,
    Previous,
}

pub trait MediaProvider: Send + Sync {
    fn now_playing(&self) -> Option<MediaInfo>;
    fn control(&self, action: MediaAction) -> Result<(), String>;
}

pub trait FullscreenDetector: Send + Sync {
    /// True while a game, video or presentation fills the screen.
    fn fullscreen_active(&self) -> bool;
}

/// Hardware cut-out at the top of the built-in display (MacBook notch).
#[derive(Clone, Copy, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Notch {
    pub width: f64,
    pub height: f64,
}

#[cfg(target_os = "macos")]
mod mac;
#[cfg(target_os = "macos")]
pub use mac::*;

#[cfg(windows)]
mod win;
#[cfg(windows)]
pub use win::*;

#[cfg(not(any(windows, target_os = "macos")))]
mod other;
#[cfg(not(any(windows, target_os = "macos")))]
pub use other::*;
