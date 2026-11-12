//! Small system readings for the island: battery.
use serde::Serialize;

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    /// false on desktops without a battery.
    pub present: bool,
    pub percent: u8,
    pub charging: bool,
    pub plugged: bool,
}

#[cfg(windows)]
pub fn battery() -> Battery {
    use ::windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut s = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut s) }.is_err() || s.BatteryFlag & 128 != 0 || s.BatteryLifePercent == 255 {
        return Battery::default();
    }
    Battery { present: true, percent: s.BatteryLifePercent, charging: s.BatteryFlag & 8 != 0, plugged: s.ACLineStatus == 1 }
}

#[cfg(target_os = "macos")]
pub fn battery() -> Battery {
    std::process::Command::new("/usr/bin/pmset")
        .args(["-g", "batt"])
        .output()
        .ok()
        .map(|o| parse_pmset(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_default()
}

/// `pmset -g batt` → "Now drawing from 'AC Power'\n -InternalBattery-0 (id=…)\t85%; charging; 0:40 remaining …"
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn parse_pmset(out: &str) -> Battery {
    let Some(line) = out.lines().find(|l| l.contains("InternalBattery")) else { return Battery::default() };
    let percent = line.split('\t').nth(1).and_then(|s| s.split('%').next()).and_then(|p| p.trim().parse().ok()).unwrap_or(0);
    let lower = line.to_lowercase();
    Battery {
        present: true,
        percent,
        charging: lower.contains("; charging"),
        plugged: out.contains("'AC Power'"),
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn battery() -> Battery {
    let dir = std::fs::read_dir("/sys/class/power_supply").ok().and_then(|d| d.filter_map(Result::ok).find(|e| e.file_name().to_string_lossy().starts_with("BAT")));
    let Some(dir) = dir else { return Battery::default() };
    let read = |f: &str| std::fs::read_to_string(dir.path().join(f)).unwrap_or_default().trim().to_string();
    let status = read("status");
    Battery { present: true, percent: read("capacity").parse().unwrap_or(0), charging: status == "Charging", plugged: status != "Discharging" }
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_pmset() {
        let b = super::parse_pmset("Now drawing from 'AC Power'\n -InternalBattery-0 (id=4653155)\t85%; charging; 0:40 remaining present: true\n");
        assert_eq!((b.present, b.percent, b.charging, b.plugged), (true, 85, true, true));
        let d = super::parse_pmset("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t42%; discharging; 3:10 remaining\n");
        assert_eq!((d.percent, d.charging, d.plugged), (42, false, false));
        assert!(!super::parse_pmset("Now drawing from 'AC Power'\n").present, "Mac mini has no battery");
    }
}
