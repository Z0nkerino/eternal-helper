//! Control centre: volume, brightness, Wi-Fi, Bluetooth, dark mode, lock and sleep.
//! Each control reports `None`/an error where the OS has no public way to do it, and the UI then offers
//! the matching system settings page instead of a broken switch.
use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Controls {
    /// 0–100, None if it can't be read.
    pub volume: Option<u8>,
    pub muted: Option<bool>,
    /// 0–100; None on desktops with external monitors and on macOS (no public API).
    pub brightness: Option<u8>,
    pub dark: Option<bool>,
    pub wifi: Option<bool>,
    pub wifi_name: Option<String>,
    pub bluetooth: Option<bool>,
    /// What this platform can switch (the UI hides the rest or links to settings).
    pub can: Can,
}

#[derive(Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Can {
    pub volume: bool,
    pub brightness: bool,
    pub dark: bool,
    pub wifi_toggle: bool,
    pub wifi_scan: bool,
    pub bluetooth_toggle: bool,
    pub lock: bool,
    pub sleep: bool,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub ssid: String,
    pub signal: u8,
    pub secure: bool,
    pub known: bool,
}

#[allow(dead_code)]
fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let mut c = Command::new(cmd);
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // no console window
    }
    let out = c.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

// ---------- parsing helpers (shared, tested on every OS) ----------

/// `netsh wlan show networks mode=bssid` → networks (strongest signal per SSID).
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub fn parse_netsh_networks(out: &str, known: &[String]) -> Vec<Network> {
    let mut nets: Vec<Network> = vec![];
    let mut cur: Option<Network> = None;
    for line in out.lines().map(str::trim) {
        if let Some(rest) = line.strip_prefix("SSID ") {
            if let Some(n) = cur.take() {
                nets.push(n);
            }
            let ssid = rest.split_once(':').map(|(_, v)| v.trim().to_string()).unwrap_or_default();
            cur = Some(Network { known: known.contains(&ssid), ssid, signal: 0, secure: true });
        } else if let Some(n) = cur.as_mut() {
            let (k, v) = line.split_once(':').map(|(k, v)| (k.trim().to_lowercase(), v.trim())).unwrap_or_default();
            if k.starts_with("authentication") || k.starts_with("проверка подлинности") {
                n.secure = !v.eq_ignore_ascii_case("open") && !v.eq_ignore_ascii_case("открытая");
            } else if k.starts_with("signal") || k.starts_with("сигнал") {
                let s = v.trim_end_matches('%').trim().parse().unwrap_or(0);
                n.signal = n.signal.max(s);
            }
        }
    }
    if let Some(n) = cur {
        nets.push(n);
    }
    nets.retain(|n| !n.ssid.is_empty());
    nets.sort_by(|a, b| b.signal.cmp(&a.signal));
    nets.dedup_by(|a, b| a.ssid == b.ssid);
    nets
}

/// Wi-Fi profile XML for `netsh wlan add profile` (WPA2-Personal or open).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn wlan_profile_xml(ssid: &str, password: Option<&str>) -> String {
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;");
    let security = match password {
        Some(p) => format!(
            "<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey>",
            esc(p)
        ),
        None => "<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>".into(),
    };
    format!(
        r#"<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{n}</name><SSIDConfig><SSID><name>{n}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>auto</connectionMode><MSM><security>{security}</security></MSM></WLANProfile>"#,
        n = esc(ssid)
    )
}

// ---------- Windows ----------

#[cfg(windows)]
mod imp {
    use super::*;
    use ::windows::{
        core::{w, Interface},
        Devices::Radios::{Radio, RadioKind, RadioState},
        Win32::{
            Media::Audio::{eConsole, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator},
            System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
            UI::WindowsAndMessaging::{SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE},
        },
    };

    fn endpoint() -> ::windows::core::Result<IAudioEndpointVolume> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dev = en.GetDefaultAudioEndpoint(eRender, eConsole)?;
            dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
        }
    }

    pub fn volume() -> (Option<u8>, Option<bool>) {
        match endpoint() {
            Ok(v) => unsafe { (v.GetMasterVolumeLevelScalar().ok().map(|x| (x * 100.0).round() as u8), v.GetMute().ok().map(|b| b.as_bool())) },
            Err(_) => (None, None),
        }
    }

    pub fn set_volume(level: u8) -> Result<(), String> {
        let v = endpoint().map_err(|e| e.to_string())?;
        unsafe {
            v.SetMasterVolumeLevelScalar(level.min(100) as f32 / 100.0, std::ptr::null()).map_err(|e| e.to_string())?;
            if level > 0 {
                let _ = v.SetMute(false, std::ptr::null());
            }
        }
        Ok(())
    }

    pub fn set_muted(m: bool) -> Result<(), String> {
        unsafe { endpoint().map_err(|e| e.to_string())?.SetMute(m, std::ptr::null()).map_err(|e| e.to_string()) }
    }

    pub fn brightness() -> Option<u8> {
        // PowerShell is slow to start; once this display has shown it has no WMI brightness, stop asking.
        use std::sync::atomic::{AtomicBool, Ordering};
        static UNSUPPORTED: AtomicBool = AtomicBool::new(false);
        if UNSUPPORTED.load(Ordering::Relaxed) {
            return None;
        }
        let v = run("powershell", &["-NoProfile", "-Command", "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness"])
            .and_then(|o| o.trim().parse().ok());
        if v.is_none() {
            UNSUPPORTED.store(true, Ordering::Relaxed);
        }
        v
    }

    pub fn set_brightness(level: u8) -> Result<(), String> {
        let script = format!("Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{Timeout=0;Brightness={}}} | Out-Null", level.min(100));
        run("powershell", &["-NoProfile", "-Command", &script]).map(|_| ()).ok_or_else(|| "This display's brightness can't be changed from Windows (external monitor?).".into())
    }

    const THEME_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

    pub fn dark() -> Option<bool> {
        let out = run("reg", &["query", THEME_KEY, "/v", "AppsUseLightTheme"])?;
        Some(out.contains("0x0"))
    }

    pub fn set_dark(on: bool) -> Result<(), String> {
        let v = if on { "0" } else { "1" };
        for name in ["AppsUseLightTheme", "SystemUsesLightTheme"] {
            run("reg", &["add", THEME_KEY, "/v", name, "/t", "REG_DWORD", "/d", v, "/f"]).ok_or("couldn't change the theme")?;
        }
        unsafe {
            let _ = SendMessageTimeoutW(HWND_BROADCAST, WM_SETTINGCHANGE, None, ::windows::Win32::Foundation::LPARAM(w!("ImmersiveColorSet").as_ptr() as isize), SMTO_ABORTIFHUNG, 200, None);
        }
        Ok(())
    }

    fn radio(kind: RadioKind) -> Option<Radio> {
        let _ = Radio::RequestAccessAsync().ok()?.get();
        let radios = Radio::GetRadiosAsync().ok()?.get().ok()?;
        (0..radios.Size().ok()?).filter_map(|i| radios.GetAt(i).ok()).find(|r| r.Kind().ok() == Some(kind))
    }

    pub fn radio_state(kind: RadioKind) -> Option<bool> {
        radio(kind)?.State().ok().map(|s| s == RadioState::On)
    }

    pub fn set_radio(kind: RadioKind, on: bool) -> Result<(), String> {
        let r = radio(kind).ok_or("No such radio on this computer")?;
        r.SetStateAsync(if on { RadioState::On } else { RadioState::Off }).map_err(|e| e.to_string())?.get().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn wifi_name() -> Option<String> {
        let out = run("netsh", &["wlan", "show", "interfaces"])?;
        out.lines().map(str::trim).find(|l| l.starts_with("SSID") && !l.starts_with("SSID BSSID") && !l.to_lowercase().starts_with("bssid")).and_then(|l| l.split_once(':')).map(|(_, v)| v.trim().to_string()).filter(|s| !s.is_empty())
    }

    fn known_profiles() -> Vec<String> {
        run("netsh", &["wlan", "show", "profiles"])
            .unwrap_or_default()
            .lines()
            .filter_map(|l| l.split_once(':').map(|(k, v)| (k.to_lowercase(), v.trim().to_string())))
            .filter(|(k, v)| (k.contains("profile") || k.contains("профил")) && !v.is_empty())
            .map(|(_, v)| v)
            .collect()
    }

    pub fn networks() -> Result<Vec<Network>, String> {
        let out = run("netsh", &["wlan", "show", "networks", "mode=bssid"]).ok_or("Wi-Fi is off or not available")?;
        Ok(parse_netsh_networks(&out, &known_profiles()))
    }

    pub fn connect(ssid: &str, password: Option<&str>) -> Result<(), String> {
        if !known_profiles().iter().any(|p| p == ssid) || password.is_some() {
            let file = std::env::temp_dir().join(format!("eh-wifi-{}.xml", std::process::id()));
            std::fs::write(&file, wlan_profile_xml(ssid, password)).map_err(|e| e.to_string())?;
            let added = run("netsh", &["wlan", "add", "profile", &format!("filename={}", file.display()), "user=current"]);
            let _ = std::fs::remove_file(&file);
            added.ok_or("Couldn't save the network")?;
        }
        run("netsh", &["wlan", "connect", &format!("name={ssid}")]).map(|_| ()).ok_or_else(|| "Couldn't connect".into())
    }

    pub fn lock() -> Result<(), String> {
        unsafe { ::windows::Win32::System::Shutdown::LockWorkStation().map_err(|e| e.to_string()) }
    }

    pub fn sleep() -> Result<(), String> {
        let ok = unsafe { ::windows::Win32::System::Power::SetSuspendState(false, false, false) };
        if ok.as_bool() { Ok(()) } else { Err("Sleep was refused".into()) }
    }

    pub fn can() -> Can {
        Can { volume: true, brightness: true, dark: true, wifi_toggle: true, wifi_scan: true, bluetooth_toggle: true, lock: true, sleep: true }
    }

    pub fn wifi_on() -> Option<bool> {
        radio_state(RadioKind::WiFi)
    }
    pub fn set_wifi(on: bool) -> Result<(), String> {
        set_radio(RadioKind::WiFi, on)
    }
    pub fn bluetooth_on() -> Option<bool> {
        radio_state(RadioKind::Bluetooth)
    }
    pub fn set_bluetooth(on: bool) -> Result<(), String> {
        set_radio(RadioKind::Bluetooth, on)
    }
    #[allow(unused_imports)]
    use Interface as _;
}

// ---------- macOS ----------

#[cfg(target_os = "macos")]
mod imp {
    use super::*;

    fn osa(script: &str) -> Option<String> {
        run("/usr/bin/osascript", &["-e", script]).map(|s| s.trim().to_string())
    }

    pub fn volume() -> (Option<u8>, Option<bool>) {
        (osa("output volume of (get volume settings)").and_then(|s| s.parse().ok()), osa("output muted of (get volume settings)").map(|s| s == "true"))
    }
    pub fn set_volume(level: u8) -> Result<(), String> {
        osa(&format!("set volume output volume {}", level.min(100))).map(|_| ()).ok_or_else(|| "couldn't set volume".into())
    }
    pub fn set_muted(m: bool) -> Result<(), String> {
        osa(&format!("set volume output muted {m}")).map(|_| ()).ok_or_else(|| "couldn't mute".into())
    }
    /// macOS has no public API for display brightness; the UI points to the keyboard keys / Settings.
    pub fn brightness() -> Option<u8> {
        None
    }
    pub fn set_brightness(_l: u8) -> Result<(), String> {
        Err("macOS doesn't allow apps to change brightness. Use the brightness keys.".into())
    }
    pub fn dark() -> Option<bool> {
        osa("tell application \"System Events\" to tell appearance preferences to get dark mode").map(|s| s == "true")
    }
    pub fn set_dark(on: bool) -> Result<(), String> {
        osa(&format!("tell application \"System Events\" to tell appearance preferences to set dark mode to {on}")).map(|_| ()).ok_or_else(|| "Allow Eternal Helper to control System Events (Privacy & Security → Automation).".into())
    }
    fn wifi_device() -> Option<String> {
        let out = run("/usr/sbin/networksetup", &["-listallhardwareports"])?;
        let mut lines = out.lines();
        while let Some(l) = lines.next() {
            if l.contains("Wi-Fi") || l.contains("AirPort") {
                return lines.next().and_then(|d| d.split_once(':')).map(|(_, v)| v.trim().to_string());
            }
        }
        None
    }
    pub fn wifi_on() -> Option<bool> {
        let dev = wifi_device()?;
        run("/usr/sbin/networksetup", &["-getairportpower", &dev]).map(|s| s.trim().ends_with("On"))
    }
    pub fn set_wifi(on: bool) -> Result<(), String> {
        let dev = wifi_device().ok_or("No Wi-Fi on this Mac")?;
        run("/usr/sbin/networksetup", &["-setairportpower", &dev, if on { "on" } else { "off" }]).map(|_| ()).ok_or_else(|| "couldn't switch Wi-Fi".into())
    }
    pub fn wifi_name() -> Option<String> {
        let dev = wifi_device()?;
        let out = run("/usr/sbin/networksetup", &["-getairportnetwork", &dev])?;
        out.split_once(':').map(|(_, v)| v.trim().to_string()).filter(|s| !s.is_empty() && !out.contains("not associated"))
    }
    /// Scanning needs CoreWLAN with Location permission; this build joins networks by name instead.
    pub fn networks() -> Result<Vec<Network>, String> {
        Err("scan-unavailable".into())
    }
    pub fn connect(ssid: &str, password: Option<&str>) -> Result<(), String> {
        let dev = wifi_device().ok_or("No Wi-Fi on this Mac")?;
        let mut args = vec!["-setairportnetwork", dev.as_str(), ssid];
        if let Some(p) = password {
            args.push(p);
        }
        let out = run("/usr/sbin/networksetup", &args).unwrap_or_default();
        if out.to_lowercase().contains("error") || out.to_lowercase().contains("could not") { Err(out.trim().to_string()) } else { Ok(()) }
    }
    fn blueutil() -> Option<&'static str> {
        ["/opt/homebrew/bin/blueutil", "/usr/local/bin/blueutil"].into_iter().find(|p| std::path::Path::new(p).exists())
    }
    pub fn bluetooth_on() -> Option<bool> {
        run(blueutil()?, &["-p"]).map(|s| s.trim() == "1")
    }
    pub fn set_bluetooth(on: bool) -> Result<(), String> {
        let b = blueutil().ok_or("bluetooth-settings")?;
        run(b, &["-p", if on { "1" } else { "0" }]).map(|_| ()).ok_or_else(|| "couldn't switch Bluetooth".into())
    }
    pub fn lock() -> Result<(), String> {
        run("/usr/bin/pmset", &["displaysleepnow"]).map(|_| ()).ok_or_else(|| "couldn't lock".into())
    }
    pub fn sleep() -> Result<(), String> {
        run("/usr/bin/pmset", &["sleepnow"]).map(|_| ()).ok_or_else(|| "couldn't sleep".into())
    }
    pub fn can() -> Can {
        Can { volume: true, brightness: false, dark: true, wifi_toggle: true, wifi_scan: false, bluetooth_toggle: blueutil().is_some(), lock: true, sleep: true }
    }
}

// ---------- Linux (development) ----------

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::*;
    pub fn volume() -> (Option<u8>, Option<bool>) {
        (Some(50), Some(false))
    }
    pub fn set_volume(_l: u8) -> Result<(), String> {
        Ok(())
    }
    pub fn set_muted(_m: bool) -> Result<(), String> {
        Ok(())
    }
    pub fn brightness() -> Option<u8> {
        None
    }
    pub fn set_brightness(_l: u8) -> Result<(), String> {
        Err("not supported".into())
    }
    pub fn dark() -> Option<bool> {
        Some(true)
    }
    pub fn set_dark(_on: bool) -> Result<(), String> {
        Ok(())
    }
    pub fn wifi_on() -> Option<bool> {
        Some(true)
    }
    pub fn set_wifi(_on: bool) -> Result<(), String> {
        Ok(())
    }
    pub fn wifi_name() -> Option<String> {
        Some("Eternal-Wi-Fi".into())
    }
    pub fn networks() -> Result<Vec<Network>, String> {
        Ok(parse_netsh_networks("SSID 1 : Eternal-Wi-Fi\n Authentication : WPA2-Personal\n Signal : 88%\nSSID 2 : Cafe\n Authentication : Open\n Signal : 41%\n", &["Eternal-Wi-Fi".into()]))
    }
    pub fn connect(_s: &str, _p: Option<&str>) -> Result<(), String> {
        Ok(())
    }
    pub fn bluetooth_on() -> Option<bool> {
        Some(false)
    }
    pub fn set_bluetooth(_on: bool) -> Result<(), String> {
        Ok(())
    }
    pub fn lock() -> Result<(), String> {
        Ok(())
    }
    pub fn sleep() -> Result<(), String> {
        Ok(())
    }
    pub fn can() -> Can {
        Can { volume: true, brightness: false, dark: true, wifi_toggle: true, wifi_scan: true, bluetooth_toggle: true, lock: true, sleep: true }
    }
}

pub use imp::{connect, lock, networks, set_bluetooth, set_brightness, set_dark, set_muted, set_volume, set_wifi, sleep};

pub fn read() -> Controls {
    let (volume, muted) = imp::volume();
    Controls {
        volume,
        muted,
        brightness: imp::brightness(),
        dark: imp::dark(),
        wifi: imp::wifi_on(),
        wifi_name: imp::wifi_name(),
        bluetooth: imp::bluetooth_on(),
        can: imp::can(),
    }
}

/// The system settings page for a control, for when the app can't switch it itself.
pub fn settings_url(page: &str) -> Option<&'static str> {
    let mac = cfg!(target_os = "macos");
    Some(match (page, mac) {
        ("bluetooth", false) => "ms-settings:bluetooth",
        ("bluetooth", true) => "x-apple.systempreferences:com.apple.BluetoothSettings",
        ("wifi", false) => "ms-settings:network-wifi",
        ("wifi", true) => "x-apple.systempreferences:com.apple.wifi-settings-extension",
        ("display", false) => "ms-settings:display",
        ("display", true) => "x-apple.systempreferences:com.apple.Displays-Settings.extension",
        ("sound", false) => "ms-settings:sound",
        ("sound", true) => "x-apple.systempreferences:com.apple.Sound-Settings.extension",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_netsh_networks() {
        let out = "\nInterface name : Wi-Fi\nThere are 3 networks currently visible.\n\nSSID 1 : Home\n    Network type            : Infrastructure\n    Authentication          : WPA2-Personal\n    Encryption              : CCMP\n    BSSID 1                 : aa:bb\n         Signal             : 62%\n    BSSID 2                 : aa:cc\n         Signal             : 91%\n\nSSID 2 : Cafe Free\n    Authentication          : Open\n         Signal             : 40%\n\nSSID 3 : \n    Authentication          : WPA2-Personal\n         Signal             : 20%\n";
        let n = parse_netsh_networks(out, &["Home".into()]);
        assert_eq!(n.len(), 2);
        assert_eq!(n[0], Network { ssid: "Home".into(), signal: 91, secure: true, known: true });
        assert!(!n[1].secure);
    }

    #[test]
    fn builds_safe_profile_xml() {
        let x = wlan_profile_xml("A&B <net>", Some("p\"w'd"));
        assert!(x.contains("A&amp;B &lt;net&gt;") && x.contains("p&quot;w&apos;d") && x.contains("WPA2PSK"));
        assert!(wlan_profile_xml("Open", None).contains("<authentication>open</authentication>"));
    }
}
