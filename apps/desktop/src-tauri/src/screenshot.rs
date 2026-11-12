//! Screenshots: capture the monitor under the cursor, then open a full-screen editor over it where the
//! user selects an area and draws on it (Lightshot-style). Windows/macOS use `xcap` (Windows Graphics /
//! CoreGraphics — macOS asks for the Screen Recording permission once); Linux dev builds use ImageMagick.
use std::{io::Cursor, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "shot";

#[derive(Default)]
pub struct ShotState {
    pub png: Mutex<Option<Vec<u8>>>,
}

#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
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

/// Hides the island and Cloudy, captures the screen under the cursor, and opens the editor over it.
pub fn start(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.destroy();
    }
    let island = app.get_webview_window("island");
    let (cx, cy, monitor) = match &island {
        Some(w) => {
            let c = w.cursor_position().map_err(|e| e.to_string())?;
            let m = app.monitor_from_point(c.x, c.y).ok().flatten().or_else(|| w.primary_monitor().ok().flatten());
            (c.x as i32, c.y as i32, m)
        }
        None => (0, 0, None),
    };
    let monitor = monitor.ok_or("no monitor")?;
    // Keep our own windows out of the picture.
    let hidden: Vec<_> = ["island", crate::cloudy::LABEL].iter().filter_map(|l| app.get_webview_window(l)).filter(|w| w.is_visible().unwrap_or(false)).collect();
    for w in &hidden {
        let _ = w.hide();
    }
    std::thread::sleep(Duration::from_millis(160));
    let shot = capture_at(cx, cy);
    for w in &hidden {
        let _ = w.show();
    }
    let png = shot?;
    *app.state::<ShotState>().png.lock().unwrap() = Some(png);

    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#shot".into()))
        .title("Screenshot")
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

pub fn take_png(app: &AppHandle) -> Option<Vec<u8>> {
    app.state::<ShotState>().png.lock().unwrap().clone()
}

pub fn folder() -> PathBuf {
    dirs::picture_dir().or_else(|| dirs::home_dir().map(|h| h.join("Pictures"))).unwrap_or_else(std::env::temp_dir).join("Eternal Helper")
}

/// Saves an edited screenshot (PNG bytes) and returns its path.
pub fn save(png: &[u8]) -> Result<PathBuf, String> {
    if png.len() < 8 || &png[1..4] != b"PNG" {
        return Err("not a PNG".into());
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
    std::fs::write(&path, png).map_err(|e| e.to_string())?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    #[test]
    fn encodes_and_rejects() {
        let img = image::RgbaImage::from_pixel(4, 3, image::Rgba([10, 20, 30, 255]));
        let png = super::encode_png(&img).unwrap();
        assert_eq!(&png[1..4], b"PNG");
        assert!(super::save(b"nope").is_err());
    }
}
