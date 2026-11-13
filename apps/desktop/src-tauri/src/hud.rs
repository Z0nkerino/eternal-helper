//! Live activities from the system, shown in the pill like iOS does: volume and brightness changes,
//! Caps Lock, and files arriving in Downloads. One light thread polls cheap system state and emits
//! `hud://event` only when something changed (the first reading is just the baseline).
use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, time::Duration};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Hud {
    Volume { value: u8, muted: bool },
    Brightness { value: u8 },
    Caps { on: bool },
    Download { name: String, path: String, done: bool, size: u64 },
}

/// Files that browsers write while downloading.
pub fn is_partial(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    [".crdownload", ".part", ".partial", ".download", ".opdownload", ".tmp"].iter().any(|e| n.ends_with(e))
}

/// The final name of a partial download ("photo.jpg.crdownload" → "photo.jpg"; Chrome's
/// "Unconfirmed 1234.crdownload" stays as is).
pub fn final_name(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    for e in [".crdownload", ".partial", ".part", ".download", ".opdownload"] {
        if lower.ends_with(e) {
            return name[..name.len() - e.len()].to_string();
        }
    }
    name.to_string()
}

#[derive(Default)]
struct Downloads {
    /// name → (size, first seen) for files present at the last check.
    seen: HashMap<String, (u64, std::time::Instant)>,
    primed: bool,
}

impl Downloads {
    /// Compares the folder with the last check: growing partial files are "in progress", new complete
    /// files are "done".
    fn check(&mut self, dir: &PathBuf) -> Vec<Hud> {
        let mut out = vec![];
        let Ok(rd) = std::fs::read_dir(dir) else { return out };
        let mut now: HashMap<String, (u64, std::time::Instant)> = HashMap::new();
        for e in rd.flatten() {
            let Ok(md) = e.metadata() else { continue };
            if !md.is_file() {
                continue;
            }
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            let size = md.len();
            let first = self.seen.get(&name).map(|x| x.1).unwrap_or_else(std::time::Instant::now);
            if self.primed {
                let path = e.path().to_string_lossy().into_owned();
                match self.seen.get(&name) {
                    None if !is_partial(&name) => out.push(Hud::Download { name: name.clone(), path, done: true, size }),
                    None => out.push(Hud::Download { name: final_name(&name), path, done: false, size }),
                    Some((old, _)) if is_partial(&name) && *old != size => out.push(Hud::Download { name: final_name(&name), path, done: false, size }),
                    _ => {}
                }
            }
            now.insert(name, (size, first));
        }
        self.seen = now;
        self.primed = true;
        out
    }
}

pub fn enabled(app: &AppHandle) -> bool {
    app.state::<crate::AppState>().settings.get().extra.get("hud").and_then(|v| v.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(true)
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        crate::platform::init_thread();
        let mut sys = sys::System::open();
        let mut last_vol: Option<(u8, bool)> = None;
        let mut last_bright: Option<u8> = None;
        let mut last_caps: Option<bool> = None;
        let mut downloads = Downloads::default();
        let dl_dir = app.path().download_dir().ok();
        let mut tick = 0u32;
        loop {
            std::thread::sleep(Duration::from_millis(150));
            tick = tick.wrapping_add(1);
            if !enabled(&app) {
                continue;
            }
            let mut events = vec![];
            if let Some(v) = sys.volume() {
                if last_vol.is_some_and(|l| l != v) {
                    events.push(Hud::Volume { value: v.0, muted: v.1 });
                }
                last_vol = Some(v);
            }
            if let Some(c) = sys.caps_lock() {
                if last_caps.is_some_and(|l| l != c) {
                    events.push(Hud::Caps { on: c });
                }
                last_caps = Some(c);
            }
            // Brightness and Downloads change less often: check them more rarely.
            if tick % 5 == 0 {
                if let Some(b) = sys.brightness() {
                    if last_bright.is_some_and(|l| l != b) {
                        events.push(Hud::Brightness { value: b });
                    }
                    last_bright = Some(b);
                }
            }
            if tick % 7 == 0 {
                if let Some(d) = &dl_dir {
                    events.extend(downloads.check(d));
                }
            }
            for e in events {
                let _ = app.emit_to("island", "hud://event", e);
            }
        }
    });
}

#[cfg(windows)]
mod sys {
    use ::windows::{
        core::{w, BSTR, VARIANT},
        Win32::{
            Media::Audio::{eConsole, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator},
            System::{
                Com::{CoCreateInstance, CoInitializeEx, CoSetProxyBlanket, CLSCTX_ALL, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE},
                Rpc::{RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE},
                Wmi::{IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE},
            },
            UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL},
        },
    };

    pub struct System {
        vol: Option<IAudioEndpointVolume>,
        vol_retry: u32,
        wmi: Option<IWbemServices>,
        wmi_failed: u32,
    }

    impl System {
        pub fn open() -> Self {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            Self { vol: None, vol_retry: 0, wmi: None, wmi_failed: 0 }
        }

        pub fn volume(&mut self) -> Option<(u8, bool)> {
            if self.vol.is_none() {
                if self.vol_retry > 0 {
                    self.vol_retry -= 1;
                    return None;
                }
                self.vol = unsafe {
                    CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                        .and_then(|en| en.GetDefaultAudioEndpoint(eRender, eConsole))
                        .and_then(|d| d.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None))
                        .ok()
                };
                self.vol_retry = 20;
            }
            let v = self.vol.as_ref()?;
            let r = unsafe { (v.GetMasterVolumeLevelScalar(), v.GetMute()) };
            match r {
                (Ok(l), Ok(m)) => Some(((l * 100.0).round() as u8, m.as_bool())),
                _ => {
                    // The speakers changed (headphones plugged in…): open the new default next time.
                    self.vol = None;
                    None
                }
            }
        }

        pub fn caps_lock(&mut self) -> Option<bool> {
            Some(unsafe { GetKeyState(VK_CAPITAL.0 as i32) } & 1 == 1)
        }

        /// The built-in display's brightness through WMI (external monitors usually don't report it).
        pub fn brightness(&mut self) -> Option<u8> {
            if self.wmi_failed >= 3 {
                return None;
            }
            if self.wmi.is_none() {
                self.wmi = unsafe {
                    CoCreateInstance::<_, IWbemLocator>(&WbemLocator, None, CLSCTX_INPROC_SERVER)
                        .and_then(|loc| loc.ConnectServer(&BSTR::from("ROOT\\WMI"), &BSTR::new(), &BSTR::new(), &BSTR::new(), 0, &BSTR::new(), None))
                        .inspect(|svc| {
                            let _ = CoSetProxyBlanket(svc, RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE, None, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, None, EOAC_NONE);
                        })
                        .ok()
                };
            }
            let svc = self.wmi.as_ref()?;
            let value = unsafe {
                let en = svc.ExecQuery(&BSTR::from("WQL"), &BSTR::from("SELECT CurrentBrightness FROM WmiMonitorBrightness"), WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY, None).ok()?;
                let mut row = [None];
                let mut got = 0u32;
                let _ = en.Next(WBEM_INFINITE, &mut row, &mut got);
                let obj = row[0].take()?;
                let mut v = VARIANT::default();
                obj.Get(w!("CurrentBrightness"), 0, &mut v, None, None).ok()?;
                i32::try_from(&v).ok().map(|n| n.clamp(0, 100) as u8)
            };
            if value.is_none() {
                self.wmi_failed += 1;
            }
            value
        }
    }
}

#[cfg(target_os = "macos")]
mod sys {
    pub struct System;
    impl System {
        pub fn open() -> Self {
            System
        }
        // macOS shows its own volume and brightness overlay.
        pub fn volume(&mut self) -> Option<(u8, bool)> {
            None
        }
        pub fn brightness(&mut self) -> Option<u8> {
            None
        }
        pub fn caps_lock(&mut self) -> Option<bool> {
            use objc2_app_kit::{NSEvent, NSEventModifierFlags};
            Some(NSEvent::modifierFlags_class().contains(NSEventModifierFlags::CapsLock))
        }
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod sys {
    pub struct System;
    impl System {
        pub fn open() -> Self {
            System
        }
        pub fn volume(&mut self) -> Option<(u8, bool)> {
            None
        }
        pub fn brightness(&mut self) -> Option<u8> {
            None
        }
        pub fn caps_lock(&mut self) -> Option<bool> {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_names() {
        assert!(is_partial("movie.mp4.crdownload"));
        assert!(is_partial("x.PART"));
        assert!(!is_partial("report.pdf"));
        assert_eq!(final_name("photo.jpg.crdownload"), "photo.jpg");
        assert_eq!(final_name("a.zip.part"), "a.zip");
    }

    #[test]
    fn notices_new_and_growing_files() {
        let dir = std::env::temp_dir().join(format!("eh-dl-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("old.txt"), "x").unwrap();
        let mut d = Downloads::default();
        assert!(d.check(&dir).is_empty(), "first look is the baseline");
        std::fs::write(dir.join("big.iso.crdownload"), "12").unwrap();
        assert!(matches!(&d.check(&dir)[..], [Hud::Download { done: false, name, .. }] if name == "big.iso"));
        std::fs::write(dir.join("big.iso.crdownload"), "12345").unwrap();
        assert_eq!(d.check(&dir).len(), 1, "still growing");
        std::fs::remove_file(dir.join("big.iso.crdownload")).unwrap();
        std::fs::write(dir.join("big.iso"), "12345").unwrap();
        assert!(matches!(&d.check(&dir)[..], [Hud::Download { done: true, name, .. }] if name == "big.iso"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
