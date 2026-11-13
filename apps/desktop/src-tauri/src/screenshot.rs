//! Screenshots: capture the monitor under the cursor, then open a full-screen editor over it where the
//! user selects an area and draws on it (Lightshot-style). Windows/macOS use `xcap` (Windows Graphics /
//! CoreGraphics — macOS asks for the Screen Recording permission once); Linux dev builds use ImageMagick.
use std::{io::Cursor, path::{Path, PathBuf}, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "shot";

#[derive(Default)]
pub struct ShotState {
    pub png: Mutex<Option<Vec<u8>>>,
    /// The saved screenshot being edited again (None for a fresh capture).
    pub editing: Mutex<Option<PathBuf>>,
    /// Our windows hidden while the editor is open, shown again when it closes.
    pub restore: Mutex<Vec<String>>,
}

fn encode_png(img: &image::RgbaImage) -> Result<Vec<u8>, String> {
    use image::{codecs::png::PngEncoder, ImageEncoder};
    let mut out = Vec::new();
    PngEncoder::new_with_quality(Cursor::new(&mut out), image::codecs::png::CompressionType::Fast, image::codecs::png::FilterType::Sub)
        .write_image(img.as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

#[cfg(any(windows, target_os = "macos"))]
fn capture_at(x: i32, y: i32) -> Result<Vec<u8>, String> {
    let monitor = match xcap::Monitor::from_point(x, y) {
        Ok(m) => m,
        Err(_) => xcap::Monitor::all().map_err(|e| e.to_string())?.into_iter().next().ok_or("Couldn't find the screen")?,
    };
    let img = monitor.capture_image().map_err(|e| {
        if cfg!(target_os = "macos") {
            format!("Couldn't capture the screen ({e}). Allow Eternal Helper in System Settings → Privacy & Security → Screen Recording.")
        } else {
            format!("Couldn't capture the screen: {e}")
        }
    })?;
    encode_png(&img)
}

#[cfg(not(any(windows, target_os = "macos")))]
fn capture_at(_x: i32, _y: i32) -> Result<Vec<u8>, String> {
    let out = std::process::Command::new("import").args(["-window", "root", "png:-"]).output().map_err(|e| format!("ImageMagick `import` is needed on Linux: {e}"))?;
    if !out.status.success() || out.stdout.is_empty() {
        return Err("screen capture failed".into());
    }
    Ok(out.stdout)
}

/// Hides our own windows (island, Cloudy) and remembers them, so the editor and the picture are clean.
fn hide_ours(app: &AppHandle) {
    let st = app.state::<ShotState>();
    let mut restore = st.restore.lock().unwrap();
    for l in ["island", crate::cloudy::LABEL] {
        if let Some(w) = app.get_webview_window(l).filter(|w| w.is_visible().unwrap_or(false)) {
            let _ = w.hide();
            if !restore.iter().any(|x| x == l) {
                restore.push(l.to_string());
            }
        }
    }
}

/// Closes the editor and brings the island and Cloudy back.
pub fn close(app: &AppHandle) {
    let st = app.state::<ShotState>();
    *st.png.lock().unwrap() = None;
    *st.editing.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.destroy();
    }
    for l in std::mem::take(&mut *st.restore.lock().unwrap()) {
        if let Some(w) = app.get_webview_window(&l) {
            let _ = w.show();
            // Back to click-through until the hit-test decides (it re-checks within a moment).
            let _ = w.set_ignore_cursor_events(true);
        }
    }
}

/// The monitor under the cursor (or the primary one).
fn cursor_monitor(app: &AppHandle) -> Option<(i32, i32, tauri::Monitor)> {
    let w = app.get_webview_window("island")?;
    let c = w.cursor_position().ok()?;
    let m = app.monitor_from_point(c.x, c.y).ok().flatten().or_else(|| w.primary_monitor().ok().flatten())?;
    Some((c.x as i32, c.y as i32, m))
}

/// Opens the full-screen editor window over the given monitor.
fn open_editor(app: &AppHandle, monitor: &tauri::Monitor) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.destroy();
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#shot".into()))
        .title("Screenshot")
        .additional_browser_args(&crate::webview_args())
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;
    let (pos, size) = (monitor.position(), monitor.size());
    let _ = w.set_position(PhysicalPosition::new(pos.x, pos.y));
    let _ = w.set_size(PhysicalSize::new(size.width, size.height));
    crate::platform::style_shot(&w);
    let _ = w.show();
    let _ = w.set_focus();
    Ok(())
}

/// Hides the island and Cloudy, captures the screen under the cursor, and opens the editor over it.
/// The island and Cloudy stay hidden until the editor closes.
pub fn start(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        close(app);
    }
    let (cx, cy, monitor) = cursor_monitor(app).ok_or("no monitor")?;
    hide_ours(app);
    // Give the compositor a moment to take our windows off the screen.
    std::thread::sleep(Duration::from_millis(220));
    let png = match capture_at(cx, cy) {
        Ok(p) => p,
        Err(e) => {
            close(app);
            return Err(e);
        }
    };
    let st = app.state::<ShotState>();
    *st.png.lock().unwrap() = Some(png);
    *st.editing.lock().unwrap() = None;
    open_editor(app, &monitor).inspect_err(|_| close(app))
}

/// Opens a saved screenshot in the editor to draw on it again.
pub fn edit(app: &AppHandle, path: &Path) -> Result<(), String> {
    if !inside_folder(path) {
        return Err("That isn't one of your screenshots.".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("Couldn't open the screenshot: {e}"))?;
    let png = if bytes.starts_with(b"\x89PNG") {
        bytes
    } else {
        // JPEG and friends become PNG for the editor.
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?.to_rgba8();
        encode_png(&img)?
    };
    let (_, _, monitor) = cursor_monitor(app).ok_or("no monitor")?;
    if app.get_webview_window(LABEL).is_some() {
        close(app);
    }
    hide_ours(app);
    let st = app.state::<ShotState>();
    *st.png.lock().unwrap() = Some(png);
    *st.editing.lock().unwrap() = Some(path.to_path_buf());
    open_editor(app, &monitor).inspect_err(|_| close(app))
}

pub fn take_png(app: &AppHandle) -> Option<Vec<u8>> {
    app.state::<ShotState>().png.lock().unwrap().clone()
}

pub fn folder() -> PathBuf {
    dirs::picture_dir().or_else(|| dirs::home_dir().map(|h| h.join("Pictures"))).unwrap_or_else(std::env::temp_dir).join("Eternal Helper")
}

/// True for files inside the screenshots folder (no tricks with `..`).
pub fn inside_folder(path: &Path) -> bool {
    let dir = folder();
    let (Ok(d), Ok(p)) = (dir.canonicalize(), path.canonicalize()) else { return false };
    p.starts_with(d) && p != dir.canonicalize().unwrap_or_default()
}

/// Saves an edited screenshot (PNG bytes) and returns its path: a new file, or over `replace`.
pub fn save(png: &[u8], replace: Option<&Path>) -> Result<PathBuf, String> {
    if png.len() < 8 || &png[1..4] != b"PNG" {
        return Err("not a PNG".into());
    }
    if let Some(p) = replace {
        if !inside_folder(p) {
            return Err("That isn't one of your screenshots.".into());
        }
        // Saved as PNG; a JPEG being replaced keeps its name but gets the .png extension.
        let target = p.with_extension("png");
        std::fs::write(&target, png).map_err(|e| format!("Couldn't save: {e}"))?;
        if target != p {
            let _ = std::fs::remove_file(p);
        }
        return Ok(target);
    }
    let dir = folder();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y-%m-%d %H-%M-%S");
    let mut path = dir.join(format!("Screenshot {stamp}.png"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("Screenshot {stamp} ({n}).png"));
        n += 1;
    }
    std::fs::write(&path, png).map_err(|e| format!("Couldn't save: {e}"))?;
    Ok(path)
}

/// Puts a PNG on the clipboard as an image (decoded here, so it works the same everywhere).
pub fn copy_png(app: &AppHandle, png: &[u8]) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let img = image::load_from_memory(png).map_err(|e| e.to_string())?.to_rgba8();
    let (w, h) = img.dimensions();
    app.clipboard().write_image(&tauri::image::Image::new_owned(img.into_raw(), w, h)).map_err(|e| format!("Couldn't copy: {e}"))
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShotFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub created_at: i64,
}

/// Screenshots in the folder, newest first.
pub fn list() -> Vec<ShotFile> {
    let Ok(rd) = std::fs::read_dir(folder()) else { return vec![] };
    let mut out: Vec<ShotFile> = rd
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let ext = p.extension()?.to_str()?.to_ascii_lowercase();
            if !["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
                return None;
            }
            let md = e.metadata().ok()?;
            let t = md.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64;
            Some(ShotFile { path: p.to_string_lossy().into_owned(), name: p.file_stem()?.to_string_lossy().into_owned(), size: md.len(), created_at: t })
        })
        .collect();
    out.sort_by_key(|f| -f.created_at);
    out
}

pub fn rename(path: &Path, title: &str) -> Result<PathBuf, String> {
    if !inside_folder(path) {
        return Err("That isn't one of your screenshots.".into());
    }
    let clean: String = title.trim().chars().filter(|c| !r#"\/:*?"<>|"#.contains(*c)).take(120).collect();
    if clean.is_empty() {
        return Err("Give it a name.".into());
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png");
    let target = path.with_file_name(format!("{clean}.{ext}"));
    if target.exists() && target != path {
        return Err("A screenshot with that name already exists.".into());
    }
    std::fs::rename(path, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

pub fn delete(path: &Path) -> Result<(), String> {
    if !inside_folder(path) {
        return Err("That isn't one of your screenshots.".into());
    }
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    fn encodes_and_rejects() {
        let img = image::RgbaImage::from_pixel(4, 3, image::Rgba([10, 20, 30, 255]));
        let png = super::encode_png(&img).unwrap();
        assert_eq!(&png[1..4], b"PNG");
        assert!(super::save(b"nope", None).is_err());
        assert!(!super::inside_folder(std::path::Path::new("/etc/passwd")));
    }
}
