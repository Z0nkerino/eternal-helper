//! Volume for the music app only (on Windows, through its own audio session), so the system volume and
//! every other app stay as they are. Elsewhere this reports "not available" and the UI hides the slider.

/// "Spotify", "Chrome", "Edge", "AppleMusic" → the executable names they run as.
#[cfg_attr(not(any(windows, test)), allow(dead_code))]
fn matches(exe: &str, hint: &str) -> bool {
    let exe = exe.to_lowercase();
    let hint: String = hint.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect();
    if hint.is_empty() {
        return false;
    }
    let hint = match hint.as_str() {
        "edge" => "msedge".to_string(),
        "yandexmusic" | "яндексмузыка" => "yandex".to_string(),
        "applemusic" | "itunes" => "music".to_string(),
        h => h.to_string(),
    };
    exe == hint || (hint.len() >= 4 && exe.contains(&hint)) || (exe.len() >= 4 && hint.contains(&exe))
}

#[cfg(windows)]
mod imp {
    use ::windows::{
        core::{Interface, PWSTR},
        Win32::{
            Foundation::CloseHandle,
            Media::Audio::{eConsole, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator},
            System::{
                Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
                Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
            },
        },
    };

    fn exe_of(pid: u32) -> Option<String> {
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut name = [0u16; 520];
            let mut len = name.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(name.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok.then(|| std::path::Path::new(&String::from_utf16_lossy(&name[..len as usize])).file_stem().map(|s| s.to_string_lossy().to_string())).flatten()
        }
    }

    /// Every audio session of the app (a browser or Spotify can have several).
    pub fn sessions(hint: &str) -> Vec<ISimpleAudioVolume> {
        let mut out = vec![];
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let Ok(en) = CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL) else { return out };
            let Ok(dev) = en.GetDefaultAudioEndpoint(eRender, eConsole) else { return out };
            let Ok(mgr) = dev.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else { return out };
            let Ok(list) = mgr.GetSessionEnumerator() else { return out };
            for i in 0..list.GetCount().unwrap_or(0) {
                let Ok(c) = list.GetSession(i) else { continue };
                let Ok(c2) = c.cast::<IAudioSessionControl2>() else { continue };
                let Ok(pid) = c2.GetProcessId() else { continue };
                if pid == 0 || pid == std::process::id() {
                    continue;
                }
                if exe_of(pid).is_some_and(|e| super::matches(&e, hint)) {
                    if let Ok(v) = c.cast::<ISimpleAudioVolume>() {
                        out.push(v);
                    }
                }
            }
        }
        out
    }

    pub fn get(hint: &str) -> Option<f32> {
        sessions(hint).first().and_then(|v| unsafe { v.GetMasterVolume().ok() })
    }

    pub fn set(hint: &str, level: f32) -> Result<(), String> {
        let list = sessions(hint);
        if list.is_empty() {
            return Err("That app isn't playing sound right now.".into());
        }
        for v in list {
            unsafe { v.SetMasterVolume(level.clamp(0.0, 1.0), std::ptr::null()) }.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn get(_hint: &str) -> Option<f32> {
        None
    }
    pub fn set(_hint: &str, _level: f32) -> Result<(), String> {
        Err("Separate music volume works on Windows.".into())
    }
}

pub use imp::{get, set};

#[cfg(test)]
mod tests {
    use super::matches;
    #[test]
    fn matches_player_names() {
        assert!(matches("Spotify", "Spotify"));
        assert!(matches("msedge", "Edge"));
        assert!(matches("chrome", "Chrome"));
        assert!(matches("YandexMusic", "Yandex Music"));
        assert!(!matches("explorer", "Spotify"));
        assert!(!matches("chrome", ""));
    }
}
