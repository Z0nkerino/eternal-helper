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
        .timeout(Duration::from_secs(600))
        .user_agent(concat!("EternalHelper/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("http client")
}

pub fn check(current: &str) -> Result<UpdateInfo, String> {
    let res = client().get(FEED).timeout(Duration::from_secs(20)).send().map_err(|e| e.to_string())?;
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

/// Downloads the installer, emitting `update://progress` (0..1), and verifies its SHA-256.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
fn download(app: &AppHandle, asset: &Asset, file: &PathBuf) -> Result<(), String> {
    let mut res = client().get(&asset.url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("download answered {}", res.status()));
    }
    let total = res.content_length().unwrap_or(asset.size).max(1);
    let mut hasher = Sha256::new();
    let mut out = std::fs::File::create(file).map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 64 * 1024];
    let (mut done, mut last_pct) = (0u64, 0u64);
    loop {
        let n = res.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        std::io::Write::write_all(&mut out, &buf[..n]).map_err(|e| e.to_string())?;
        done += n as u64;
        let pct = done * 100 / total;
        if pct != last_pct {
            last_pct = pct;
            let _ = app.emit("update://progress", done as f64 / total as f64);
        }
    }
    let got = format!("{:x}", hasher.finalize());
    if !got.eq_ignore_ascii_case(asset.sha256.trim()) {
        let _ = std::fs::remove_file(file);
        return Err("The download is damaged (checksum mismatch). Try again later.".into());
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
        // Give the app a moment to quit, install silently (per-user, no admin), then start the new version.
        let script = format!("timeout /t 2 /nobreak >nul & \"{}\" /S & start \"\" \"{}\"", file.display(), exe.display());
        std::process::Command::new("cmd").args(["/C", &script]).creation_flags(0x0800_0000).spawn().map_err(|e| e.to_string())?;
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
