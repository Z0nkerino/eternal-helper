//! In-app updates from GitHub Releases.
//!
//! Each release carries `latest.json` with the version, notes and, per platform, the installer URL and
//! its SHA-256. The app downloads the installer, checks the hash, then installs it and restarts:
//! - Windows: runs the NSIS installer silently (per-user install, no admin rights) and relaunches.
//! - macOS: mounts the DMG, swaps the .app bundle in place and relaunches.
//! Integrity comes from HTTPS + the published hash. Signature-based updates (tauri-plugin-updater) can
//! replace this once a signing key is added to the repository secrets.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, io::Read, path::PathBuf, time::Duration};
use tauri::{AppHandle, Emitter};

pub const FEED: &str = "https://github.com/Z0nkerino/eternal-helper/releases/latest/download/latest.json";
pub const RELEASES: &str = "https://github.com/Z0nkerino/eternal-helper/releases/latest";

#[derive(Deserialize, Debug)]
pub struct Feed {
    pub version: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub platforms: HashMap<String, Asset>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Asset {
    pub url: String,
    pub sha256: String,
    #[serde(default)]
    pub size: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub available: bool,
    pub notes: String,
    /// None when this platform can't update itself (then the release page is offered).
    pub asset: Option<Asset>,
}

pub fn platform_key() -> &'static str {
    if cfg!(windows) {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") {
        "macos-universal"
    } else {
        "linux"
    }
}

/// "0.10.2" > "0.9.9"; anything after a '-' (pre-release) is ignored.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> { v.trim_start_matches('v').split('-').next().unwrap_or("").split('.').map(|p| p.parse().unwrap_or(0)).collect() };
    parse(latest) > parse(current)
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        // A slow network is fine; a stalled one is retried (see `download`).
        .timeout(Duration::from_secs(900))
        .user_agent(concat!("EternalHelper/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("http client")
}

/// Short, readable reason for a network error (reqwest's own messages are long).
fn reason(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "the connection timed out".into()
    } else if e.is_connect() {
        "couldn't connect to GitHub".into()
    } else {
        let mut msg = e.to_string();
        let mut src = std::error::Error::source(e);
        while let Some(s) = src {
            msg = s.to_string();
            src = s.source();
        }
        msg
    }
}

pub fn check(current: &str) -> Result<UpdateInfo, String> {
    let res = client().get(FEED).timeout(Duration::from_secs(25)).send().map_err(|e| format!("Couldn't check for updates: {}", reason(&e)))?;
    if !res.status().is_success() {
        return Err(format!("update feed answered {}", res.status()));
    }
    let feed: Feed = res.json().map_err(|e| e.to_string())?;
    Ok(UpdateInfo {
        current: current.into(),
        available: is_newer(&feed.version, current),
        latest: feed.version,
        notes: feed.notes,
        asset: feed.platforms.get(platform_key()).cloned(),
    })
}

/// Downloads the installer, emitting `update://progress` (0..1), and verifies its SHA-256. A dropped or
/// stalled connection is retried (up to 5 times), continuing where it stopped when the server allows it.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
fn download(app: &AppHandle, asset: &Asset, file: &PathBuf) -> Result<(), String> {
    let client = client();
    let mut out = std::fs::File::create(file).map_err(|e| format!("Couldn't save the update: {e}"))?;
    let mut done = 0u64;
    let mut total = asset.size.max(1);
    let mut last_pct = u64::MAX;
    let mut last_err = String::new();
    let mut buf = vec![0u8; 64 * 1024];
    for attempt in 0..5 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_secs(2 * attempt as u64));
        }
        let mut req = client.get(&asset.url);
        if done > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={done}-"));
        }
        let mut res = match req.send() {
            Ok(r) => r,
            Err(e) => {
                last_err = reason(&e);
                continue;
            }
        };
        let status = res.status();
        if done > 0 && status != reqwest::StatusCode::PARTIAL_CONTENT {
            // The server ignored the range: start over.
            done = 0;
            out = std::fs::File::create(file).map_err(|e| e.to_string())?;
        }
        if !status.is_success() {
            last_err = format!("GitHub answered {status}");
            continue;
        }
        if done == 0 {
            total = res.content_length().unwrap_or(asset.size).max(1);
        }
        loop {
            match res.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    std::io::Write::write_all(&mut out, &buf[..n]).map_err(|e| format!("Couldn't save the update: {e}"))?;
                    done += n as u64;
                    let pct = done * 100 / total;
                    if pct != last_pct {
                        last_pct = pct;
                        let _ = app.emit("update://progress", (done as f64 / total as f64).min(1.0));
                    }
                }
                Err(e) => {
                    last_err = format!("the download was interrupted ({e})");
                    break;
                }
            }
        }
        if done >= total || (asset.size == 0 && last_err.is_empty()) {
            break;
        }
    }
    drop(out);
    if done < total {
        let _ = std::fs::remove_file(file);
        return Err(format!("The download didn't finish: {last_err}. Check your connection, or download the update from the website."));
    }
    let mut hasher = Sha256::new();
    let mut f = std::fs::File::open(file).map_err(|e| e.to_string())?;
    std::io::copy(&mut f, &mut hasher).map_err(|e| e.to_string())?;
    let got = format!("{:x}", hasher.finalize());
    if !got.eq_ignore_ascii_case(asset.sha256.trim()) {
        let _ = std::fs::remove_file(file);
        return Err("The download is damaged (checksum mismatch). Try again.".into());
    }
    Ok(())
}

/// Downloads, verifies and starts installing. On success the app exits and the new version starts.
pub fn install(app: &AppHandle, asset: &Asset, version: &str) -> Result<(), String> {
    let dir = std::env::temp_dir().join("eternal-helper-update");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let file = dir.join(format!("Eternal-Helper-{version}-setup.exe"));
        download(app, asset, &file)?;
        // A small script waits until this app has really quit (so its files can be replaced), installs
        // silently (per-user, no admin) and starts the new version. `ping` is the wait because
        // `timeout` needs a console, which a background script doesn't have.
        let pid = std::process::id();
        let script = format!(
            "@echo off\r\nchcp 65001 >nul\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)\r\n\"{installer}\" /S\r\nstart \"\" \"{exe}\"\r\ndel \"%~f0\"\r\n",
            installer = file.display(),
            exe = exe.display()
        );
        let cmd_file = dir.join("install-update.cmd");
        // UTF-8 (with chcp 65001 above) so paths with non-Latin letters (a user name in Cyrillic) work.
        std::fs::write(&cmd_file, script).map_err(|e| format!("Couldn't prepare the update: {e}"))?;
        std::process::Command::new("cmd").arg("/C").raw_arg(format!("\"{}\"", cmd_file.display())).creation_flags(0x0800_0000).spawn().map_err(|e| format!("Couldn't start the installer: {e}"))?;
        app.exit(0);
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        // …/Eternal Helper.app/Contents/MacOS/eternal-helper → …/Eternal Helper.app
        let bundle = exe.ancestors().nth(3).ok_or("can't find the app bundle")?.to_path_buf();
        if bundle.extension().and_then(|e| e.to_str()) != Some("app") {
            return Err("Updates work for the installed app (in Applications).".into());
        }
        let parent = bundle.parent().ok_or("no parent folder")?;
        let probe = parent.join(".eternal-helper-write-test");
        if std::fs::write(&probe, b"").is_err() {
            return Err(format!("Can't write to {}. Move Eternal Helper to your Applications folder, or download the update manually.", parent.display()));
        }
        let _ = std::fs::remove_file(probe);
        let file = dir.join(format!("Eternal-Helper-{version}-mac.dmg"));
        download(app, asset, &file)?;
        let script = format!(
            r#"sleep 1
MNT=$(mktemp -d /tmp/eh-update.XXXXXX)
hdiutil attach -nobrowse -quiet -mountpoint "$MNT" "{dmg}" || exit 1
SRC=$(find "$MNT" -maxdepth 1 -name "*.app" | head -n 1)
APP="{app}"
rm -rf "$APP.old"
if mv "$APP" "$APP.old" && ditto "$SRC" "$APP"; then rm -rf "$APP.old"; else rm -rf "$APP"; mv "$APP.old" "$APP"; fi
hdiutil detach -quiet "$MNT"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
open "$APP"
"#,
            dmg = file.display(),
            app = bundle.display()
        );
        std::process::Command::new("/bin/sh").args(["-c", &script]).spawn().map_err(|e| e.to_string())?;
        app.exit(0);
        Ok(())
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (app, asset, version, dir, exe);
        Err("Self-update isn't available on this platform.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(is_newer("0.2.0", "0.1.1"));
        assert!(is_newer("v0.10.0", "0.9.9"));
        assert!(!is_newer("0.1.1", "0.1.1"));
        assert!(!is_newer("0.1.0", "0.1.1"));
        assert!(!is_newer("0.2.0-beta", "0.2.0"));
    }

    #[test]
    fn reads_feed() {
        let f: Feed = serde_json::from_str(r#"{"version":"0.2.0","notes":"Hi","platforms":{"macos-universal":{"url":"https://x/y.dmg","sha256":"ab","size":5}}}"#).unwrap();
        assert_eq!(f.platforms["macos-universal"].size, 5);
    }
}
