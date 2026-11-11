//! Screen recordings: writing them to disk as they're captured, and the library of saved videos.
//!
//! Windows (and Linux dev builds): the webview captures with getDisplayMedia + MediaRecorder and streams
//! one-second chunks here, so memory stays flat however long the recording is.
//! macOS: the system `screencapture -v` tool records natively (Screen Recording permission), and we stop
//! it with SIGINT so it finalises the .mov file.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Child,
    sync::Mutex,
};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub title: String,
    pub path: String,
    pub size: u64,
    pub duration_ms: u64,
    pub created_at: i64,
}

#[derive(Default)]
pub struct RecorderState {
    open: Mutex<HashMap<String, (File, PathBuf)>>,
    native: Mutex<Option<(Child, PathBuf, i64)>>,
    index_lock: Mutex<()>,
}

pub const VIDEO_EXT: [&str; 4] = ["mp4", "webm", "mov", "mkv"];

pub fn default_folder() -> PathBuf {
    dirs::video_dir().or_else(|| dirs::home_dir().map(|h| h.join("Videos"))).unwrap_or_else(std::env::temp_dir).join("Eternal Helper")
}

pub fn folder(custom: &str) -> PathBuf {
    if custom.trim().is_empty() { default_folder() } else { PathBuf::from(custom) }
}

fn now_ms() -> i64 {
    chrono::Local::now().timestamp_millis()
}

fn new_path(dir: &Path, ext: &str) -> Result<(String, PathBuf), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Can't create {}: {e}", dir.display()))?;
    let stamp = chrono::Local::now().format("%Y-%m-%d %H-%M-%S").to_string();
    let ext = if VIDEO_EXT.contains(&ext) { ext } else { "webm" };
    let mut path = dir.join(format!("Recording {stamp}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("Recording {stamp} ({n}).{ext}"));
        n += 1;
    }
    Ok((format!("rec-{}", now_ms()), path))
}

// ---------- Index (titles and durations; the files themselves are the source of truth) ----------

fn index_path(dir: &Path) -> PathBuf {
    dir.join(".eternal-recordings.json")
}

fn read_index(dir: &Path) -> Vec<Recording> {
    fs::read_to_string(index_path(dir)).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

fn write_index(dir: &Path, list: &[Recording]) -> Result<(), String> {
    fs::write(index_path(dir), serde_json::to_vec_pretty(list).unwrap()).map_err(|e| e.to_string())
}

/// Every video in the folder, newest first. Files added or removed by hand are picked up too.
pub fn list(dir: &Path) -> Vec<Recording> {
    let index = read_index(dir);
    let mut out = vec![];
    let Ok(entries) = fs::read_dir(dir) else { return out };
    for e in entries.filter_map(Result::ok) {
        let p = e.path();
        let ext = p.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        if !VIDEO_EXT.contains(&ext.as_str()) {
            continue;
        }
        let meta = match e.metadata() { Ok(m) => m, Err(_) => continue };
        let path = p.to_string_lossy().into_owned();
        let known = index.iter().find(|r| r.path == path);
        let created = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
        out.push(Recording {
            id: known.map(|r| r.id.clone()).unwrap_or_else(|| format!("file-{created}-{}", meta.len())),
            title: known.map(|r| r.title.clone()).unwrap_or_else(|| p.file_stem().unwrap_or_default().to_string_lossy().into_owned()),
            path,
            size: meta.len(),
            duration_ms: known.map(|r| r.duration_ms).unwrap_or(0),
            created_at: known.map(|r| r.created_at).unwrap_or(created),
        });
    }
    out.sort_by_key(|r| -r.created_at);
    out
}

impl RecorderState {
    fn remember(&self, dir: &Path, rec: Recording) -> Result<(), String> {
        let _g = self.index_lock.lock().unwrap();
        let mut idx = read_index(dir);
        idx.retain(|r| r.path != rec.path);
        idx.push(rec);
        write_index(dir, &idx)
    }

    // ----- Webview-captured recordings -----

    pub fn begin(&self, dir: &Path, ext: &str) -> Result<String, String> {
        let (id, path) = new_path(dir, ext)?;
        let file = OpenOptions::new().create_new(true).write(true).open(&path).map_err(|e| e.to_string())?;
        self.open.lock().unwrap().insert(id.clone(), (file, path));
        Ok(id)
    }

    pub fn append(&self, id: &str, bytes: &[u8]) -> Result<(), String> {
        let mut open = self.open.lock().unwrap();
        let (file, _) = open.get_mut(id).ok_or("Recording isn't open")?;
        file.write_all(bytes).map_err(|e| e.to_string())
    }

    pub fn finish(&self, dir: &Path, id: &str, duration_ms: u64) -> Result<Recording, String> {
        let (mut file, path) = self.open.lock().unwrap().remove(id).ok_or("Recording isn't open")?;
        file.flush().map_err(|e| e.to_string())?;
        drop(file);
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if size == 0 {
            let _ = fs::remove_file(&path);
            return Err("Nothing was recorded.".into());
        }
        let rec = Recording {
            id: id.into(),
            title: path.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            size,
            duration_ms,
            created_at: now_ms(),
        };
        self.remember(dir, rec.clone())?;
        Ok(rec)
    }

    pub fn cancel(&self, id: &str) {
        if let Some((file, path)) = self.open.lock().unwrap().remove(id) {
            drop(file);
            let _ = fs::remove_file(path);
        }
    }

    // ----- Native recordings (macOS screencapture) -----

    #[allow(unused_variables)]
    pub fn native_start(&self, dir: &Path, with_mic: bool) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            let mut slot = self.native.lock().unwrap();
            if slot.is_some() {
                return Err("Already recording".into());
            }
            let (_, path) = new_path(dir, "mov")?;
            let mut cmd = std::process::Command::new("/usr/sbin/screencapture");
            cmd.args(["-v", "-C", "-k", "-x"]);
            if with_mic {
                cmd.arg("-g");
            }
            let child = cmd.arg(&path).spawn().map_err(|e| e.to_string())?;
            *slot = Some((child, path, now_ms()));
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        Err("Native recording is only used on macOS".into())
    }

    pub fn native_stop(&self, dir: &Path) -> Result<Recording, String> {
        let (mut child, path, started) = self.native.lock().unwrap().take().ok_or("Not recording")?;
        #[cfg(unix)]
        unsafe {
            libc::kill(child.id() as i32, libc::SIGINT);
        }
        #[cfg(not(unix))]
        let _ = child.kill();
        let _ = child.wait();
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if size == 0 {
            return Err("Nothing was recorded. Check Screen Recording permission in System Settings → Privacy & Security.".into());
        }
        let rec = Recording {
            id: format!("rec-{started}"),
            title: path.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            size,
            duration_ms: (now_ms() - started).max(0) as u64,
            created_at: started,
        };
        self.remember(dir, rec.clone())?;
        Ok(rec)
    }

    // ----- Library -----

    pub fn rename(&self, dir: &Path, path: &str, title: &str) -> Result<(), String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("Name can't be empty".into());
        }
        let _g = self.index_lock.lock().unwrap();
        let mut idx = read_index(dir);
        match idx.iter_mut().find(|r| r.path == path) {
            Some(r) => r.title = title.into(),
            None => {
                let meta = fs::metadata(path).map_err(|e| e.to_string())?;
                idx.push(Recording { id: format!("file-{}", now_ms()), title: title.into(), path: path.into(), size: meta.len(), duration_ms: 0, created_at: now_ms() });
            }
        }
        write_index(dir, &idx)
    }

    pub fn delete(&self, dir: &Path, path: &str) -> Result<(), String> {
        let p = Path::new(path);
        // Only ever delete videos inside the recordings folder.
        let inside = p.parent().and_then(|d| d.canonicalize().ok()) == dir.canonicalize().ok();
        let ext_ok = p.extension().and_then(|x| x.to_str()).is_some_and(|x| VIDEO_EXT.contains(&x.to_lowercase().as_str()));
        if !inside || !ext_ok {
            return Err("Only recordings in the Eternal Helper folder can be deleted here.".into());
        }
        fs::remove_file(p).map_err(|e| e.to_string())?;
        let _g = self.index_lock.lock().unwrap();
        let mut idx = read_index(dir);
        idx.retain(|r| r.path != path);
        write_index(dir, &idx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_list_rename_delete() {
        let dir = std::env::temp_dir().join(format!("eh-rec-{}", std::process::id()));
        let st = RecorderState::default();
        let id = st.begin(&dir, "webm").unwrap();
        st.append(&id, b"abc").unwrap();
        st.append(&id, b"def").unwrap();
        let rec = st.finish(&dir, &id, 2000).unwrap();
        assert_eq!(rec.size, 6);

        let all = list(&dir);
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].duration_ms, 2000);

        st.rename(&dir, &rec.path, "Demo").unwrap();
        assert_eq!(list(&dir)[0].title, "Demo");

        assert!(st.delete(&dir, "/etc/passwd").is_err());
        st.delete(&dir, &rec.path).unwrap();
        assert!(list(&dir).is_empty());

        let empty = st.begin(&dir, "mp4").unwrap();
        assert!(st.finish(&dir, &empty, 0).is_err(), "empty recordings are discarded");
        let _ = fs::remove_dir_all(dir);
    }
}
