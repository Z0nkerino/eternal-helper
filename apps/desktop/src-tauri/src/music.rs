//! Music accounts: Spotify, Yandex Music and SoundCloud.
//!
//! Each service opens its official web player in an app window. The user signs in on the service's own
//! page (we never see the password); the login is kept in the app's web storage. A small script added
//! to that window reads the page's standard Media Session (title, artist, cover, play state) and gives
//! the island play/pause/next/previous. That window may only call one command, `music_report`
//! (see capabilities/music.json). Closing the window just hides it, so the music keeps playing.
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub struct Service {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
}

pub const SERVICES: [Service; 3] = [
    Service { id: "spotify", name: "Spotify", url: "https://open.spotify.com/" },
    Service { id: "yandex", name: "Yandex Music", url: "https://music.yandex.ru/" },
    Service { id: "soundcloud", name: "SoundCloud", url: "https://soundcloud.com/" },
];

#[derive(Deserialize, Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicReport {
    pub service: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub album: String,
    pub artwork: Option<String>,
    #[serde(default)]
    pub playing: bool,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
}

pub fn label(id: &str) -> String {
    format!("music-{id}")
}

pub fn find(id: &str) -> Option<&'static Service> {
    SERVICES.iter().find(|s| s.id == id)
}

const BRIDGE: &str = r#"
(() => {
  if (window.__ehMusicBridge) return;
  window.__ehMusicBridge = true;
  const SERVICE = '__SERVICE__';
  const ms = navigator.mediaSession;
  const handlers = {};
  let pos = null;
  if (ms) {
    const setAction = ms.setActionHandler && ms.setActionHandler.bind(ms);
    if (setAction) ms.setActionHandler = (action, fn) => { handlers[action] = fn; try { return setAction(action, fn); } catch (e) {} };
    const setPos = ms.setPositionState && ms.setPositionState.bind(ms);
    if (setPos) ms.setPositionState = (s) => { pos = s ? { ...s, at: Date.now() } : null; try { return setPos(s); } catch (e) {} };
  }
  const media = () => { const all = [...document.querySelectorAll('audio,video')]; return all.find((m) => !m.paused) || all[0]; };
  window.__ehMusic = (action) => {
    const playing = ms && ms.playbackState === 'playing';
    if (action === 'toggle') {
      const h = handlers[playing ? 'pause' : 'play'];
      if (h) return h({ action: playing ? 'pause' : 'play' });
      const m = media(); if (m) return m.paused ? m.play() : m.pause();
      return;
    }
    const name = action === 'next' ? 'nexttrack' : 'previoustrack';
    if (handlers[name]) handlers[name]({ action: name });
  };
  let last = '';
  setInterval(() => {
    const md = ms && ms.metadata;
    const m = media();
    const playing = ms && ms.playbackState && ms.playbackState !== 'none' ? ms.playbackState === 'playing' : !!(m && !m.paused);
    const art = md && md.artwork && md.artwork.length ? md.artwork[md.artwork.length - 1].src : null;
    let position = null, duration = null;
    if (pos && isFinite(pos.duration)) {
      duration = pos.duration * 1000;
      position = (pos.position || 0) * 1000 + (playing ? (Date.now() - pos.at) * (pos.playbackRate || 1) : 0);
    } else if (m && isFinite(m.duration)) { duration = m.duration * 1000; position = m.currentTime * 1000; }
    const report = md && md.title
      ? { service: SERVICE, title: md.title, artist: md.artist || '', album: md.album || '', artwork: art, playing,
          positionMs: position == null ? null : Math.max(0, Math.round(position)), durationMs: duration == null ? null : Math.round(duration) }
      : { service: SERVICE, title: '', artist: '', album: '', artwork: null, playing: false, positionMs: null, durationMs: null };
    const key = JSON.stringify({ ...report, positionMs: 0 });
    if (key === last && !playing) return;
    last = key;
    const ipc = window.__TAURI_INTERNALS__;
    if (ipc) ipc.invoke('music_report', { report }).catch(() => {});
  }, 1000);
})();
"#;

/// A browser user agent the services accept (their web players reject unknown browsers).
pub fn user_agent() -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15")
    } else if cfg!(windows) {
        None // WebView2 already identifies as Edge
    } else {
        Some("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
    }
}

/// Opens (or shows) the service's player window. `show: false` starts it hidden in the background.
pub fn open(app: &AppHandle, id: &str, show: bool) -> Result<(), String> {
    let svc = find(id).ok_or("unknown service")?;
    if let Some(w) = app.get_webview_window(&label(id)) {
        if show {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }
    let mut b = WebviewWindowBuilder::new(app, label(id), WebviewUrl::External(svc.url.parse::<tauri::Url>().map_err(|e| e.to_string())?))
        .title(format!("{} — Eternal Helper", svc.name))
        .inner_size(1100.0, 760.0)
        .min_inner_size(420.0, 520.0)
        .center()
        .visible(show)
        .initialization_script(BRIDGE.replace("__SERVICE__", svc.id));
    if let Some(ua) = user_agent() {
        b = b.user_agent(ua);
    }
    b.build().map(|_| ()).map_err(|e| e.to_string())
}

pub fn control(app: &AppHandle, id: &str, action: &str) -> Result<(), String> {
    if !["toggle", "next", "previous"].contains(&action) {
        return Err("bad action".into());
    }
    let w = app.get_webview_window(&label(id)).ok_or("player isn't open")?;
    w.eval(format!("window.__ehMusic && window.__ehMusic('{action}')")).map_err(|e| e.to_string())
}

/// Signs out of every music service: clears the players' cookies and storage, then closes them.
pub fn sign_out(app: &AppHandle) -> Result<(), String> {
    for s in &SERVICES {
        if let Some(w) = app.get_webview_window(&label(s.id)) {
            let _ = w.clear_all_browsing_data();
            let _ = w.destroy();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_is_per_service() {
        assert!(BRIDGE.contains("__SERVICE__"));
        assert!(find("yandex").is_some() && find("deezer").is_none());
        let r: MusicReport = serde_json::from_str(r#"{"service":"spotify","title":"Song","artist":"A","playing":true,"positionMs":1200,"durationMs":200000,"artwork":null}"#).unwrap();
        assert!(r.playing && r.position_ms == Some(1200));
    }
}
