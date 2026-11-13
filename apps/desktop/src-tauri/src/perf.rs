//! In-game overlay: while a fullscreen app (a game, usually) is in front, a small click-through pill in a
//! corner of the screen shows the frame rate, CPU and GPU load, memory use and the time — like the
//! overlays of GPU vendors. Stats are sampled once a second, only while the overlay is visible.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "perf";

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    /// Frames the screen showed in the last second (Windows; None when it can't be measured, e.g. a game
    /// in exclusive fullscreen that bypasses the desktop compositor).
    pub fps: Option<u32>,
    pub cpu: f32,
    pub gpu: Option<f32>,
    pub ram: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

struct Sampler {
    sys: sysinfo::System,
    #[cfg(windows)]
    gpu: Option<win::Gpu>,
    #[cfg(windows)]
    frames: Option<(u64, std::time::Instant)>,
}

static SAMPLER: Mutex<Option<Sampler>> = Mutex::new(None);

pub fn settings(app: &AppHandle) -> (bool, String) {
    let s = app.state::<crate::AppState>().settings.get();
    let p = s.extra.get("perf");
    let on = p.and_then(|v| v.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(true);
    let corner = p.and_then(|v| v.get("corner")).and_then(|v| v.as_str()).unwrap_or("top-left").to_string();
    (on, corner)
}

fn sample() -> Stats {
    let mut guard = SAMPLER.lock().unwrap();
    let s = guard.get_or_insert_with(|| {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu_usage();
        Sampler {
            sys,
            #[cfg(windows)]
            gpu: win::Gpu::open(),
            #[cfg(windows)]
            frames: None,
        }
    });
    s.sys.refresh_cpu_usage();
    s.sys.refresh_memory();
    let total = s.sys.total_memory().max(1) as f32;
    let used = s.sys.used_memory() as f32;
    #[allow(unused_mut)]
    let mut st = Stats { fps: None, cpu: s.sys.global_cpu_usage(), gpu: None, ram: used / total * 100.0, ram_used_gb: used / 1e9, ram_total_gb: total / 1e9 };
    #[cfg(windows)]
    {
        st.gpu = s.gpu.as_mut().and_then(|g| g.usage());
        if let Some(f) = win::frames() {
            let now = std::time::Instant::now();
            if let Some((prev, at)) = s.frames {
                let secs = now.duration_since(at).as_secs_f64().max(0.2);
                let fps = ((f.saturating_sub(prev)) as f64 / secs).round() as u32;
                st.fps = (fps >= 2).then_some(fps);
            }
            s.frames = Some((f, now));
        }
    }
    st
}

/// Called once a second by the screen watch: shows or hides the overlay and sends fresh stats.
pub fn tick(app: &AppHandle, fullscreen: bool) {
    let (on, corner) = settings(app);
    let w = app.get_webview_window(LABEL);
    if !(on && fullscreen) {
        if let Some(w) = w.filter(|w| w.is_visible().unwrap_or(false)) {
            let _ = w.hide();
        }
        return;
    }
    let w = match w {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html#perf".into()))
            .title("Eternal Helper overlay")
            .additional_browser_args(&crate::webview_args())
            .inner_size(340.0, 44.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .focused(false)
            .visible(false)
            .background_color(tauri::webview::Color(0, 0, 0, 0))
            .build()
        {
            Ok(w) => {
                crate::platform::style_overlay(&w);
                w
            }
            Err(_) => return,
        },
    };
    if let Ok(Some(m)) = w.current_monitor().or_else(|_| w.primary_monitor()) {
        let (pos, size, scale) = (m.position(), m.size(), m.scale_factor());
        let (ww, hh) = ((340.0 * scale) as i32, (44.0 * scale) as i32);
        let pad = (14.0 * scale) as i32;
        let x = if corner.ends_with("right") { pos.x + size.width as i32 - ww - pad } else { pos.x + pad };
        let y = if corner.starts_with("bottom") { pos.y + size.height as i32 - hh - pad } else { pos.y + pad };
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    if !w.is_visible().unwrap_or(false) {
        let _ = w.show();
        let _ = w.set_ignore_cursor_events(true);
    }
    crate::platform::raise_topmost(&w);
    let _ = w.emit_to(LABEL, "perf://stats", sample());
}

#[cfg(windows)]
mod win {
    use ::windows::{
        core::w,
        Win32::{
            Graphics::Dwm::{DwmGetCompositionTimingInfo, DWM_TIMING_INFO},
            Foundation::HWND,
            System::Performance::{PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE},
        },
    };

    /// Total frames the desktop compositor has shown.
    pub fn frames() -> Option<u64> {
        let mut t = DWM_TIMING_INFO { cbSize: std::mem::size_of::<DWM_TIMING_INFO>() as u32, ..Default::default() };
        unsafe { DwmGetCompositionTimingInfo(HWND::default(), &mut t) }.ok()?;
        Some(t.cFramesDisplayed)
    }

    /// GPU load: the busiest 3D engine, from the "GPU Engine" performance counters.
    pub struct Gpu {
        query: isize,
        counter: isize,
    }
    unsafe impl Send for Gpu {}

    impl Gpu {
        pub fn open() -> Option<Gpu> {
            unsafe {
                let mut query = 0isize;
                if PdhOpenQueryW(None, 0, &mut query) != 0 {
                    return None;
                }
                let mut counter = 0isize;
                if PdhAddEnglishCounterW(query, w!("\\GPU Engine(*engtype_3D)\\Utilization Percentage"), 0, &mut counter) != 0 {
                    return None;
                }
                let _ = PdhCollectQueryData(query);
                Some(Gpu { query, counter })
            }
        }

        pub fn usage(&mut self) -> Option<f32> {
            unsafe {
                if PdhCollectQueryData(self.query) != 0 {
                    return None;
                }
                let (mut size, mut count) = (0u32, 0u32);
                let _ = PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE, &mut size, &mut count, None);
                if size == 0 {
                    return None;
                }
                let mut buf = vec![0u8; size as usize];
                let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                if PdhGetFormattedCounterArrayW(self.counter, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items)) != 0 {
                    return None;
                }
                // Per process and engine: add up per engine instance, then take the busiest engine.
                let slice = std::slice::from_raw_parts(items, count as usize);
                let total: f64 = slice.iter().map(|i| i.FmtValue.Anonymous.doubleValue).sum();
                Some(total.clamp(0.0, 100.0) as f32)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn samples_cpu_and_memory() {
        let s = super::sample();
        assert!(s.ram > 0.0 && s.ram <= 100.0);
        assert!(s.ram_total_gb > 0.1);
        assert!(s.cpu >= 0.0);
    }
}
