//! App settings, stored as JSON in the OS config dir. Secrets live in the system keychain (see secrets.rs).
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// "auto" | "en" | "ru"
    pub language: String,
    /// "primary" | "cursor"
    pub monitor: String,
    pub hotkey: String,
    pub autostart: bool,
    pub do_not_disturb: bool,
    pub hide_in_fullscreen: bool,
    pub accent: String,
    /// Where the panel's tabs sit: "auto" (bottom on notched displays, top elsewhere) | "top" | "bottom" | "side".
    pub tabs_position: String,
    /// Developer option: draw the notch and safe zones over the island.
    pub debug_safe_areas: bool,
    pub weather: WeatherSettings,
    pub planner: PlannerSettings,
    pub afina: AfinaSettings,
    pub recording: RecordingSettings,
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct WeatherSettings {
    pub place: String,
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    /// "c" | "f"
    pub unit: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct PlannerSettings {
    pub enabled: bool,
    /// Port of the local webhook receiver on 127.0.0.1. Chosen at random on first run.
    pub port: u16,
    /// Secret part of the webhook path, so other local apps can't post into the island.
    pub token: String,
    /// Folder where Universal Planner's "Backup folder" connector writes daily JSON backups.
    pub backup_dir: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct AfinaSettings {
    pub enabled: bool,
    /// "anthropic" | "openai" | "ollama" | "off"
    pub provider: String,
    pub model: String,
    /// Base URL for OpenAI-compatible servers and Ollama.
    pub base_url: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct RecordingSettings {
    /// "none" | "system" | "system+mic"
    pub audio: String,
    /// Empty = the default Videos/Movies folder.
    pub folder: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "auto".into(),
            monitor: "primary".into(),
            hotkey: "Alt+Space".into(),
            autostart: false,
            do_not_disturb: false,
            hide_in_fullscreen: true,
            accent: "#2F6BFF".into(),
            tabs_position: "auto".into(),
            debug_safe_areas: false,
            weather: WeatherSettings { unit: "c".into(), ..Default::default() },
            planner: PlannerSettings::default(),
            afina: AfinaSettings::default(),
            recording: RecordingSettings::default(),
        }
    }
}

impl Default for PlannerSettings {
    fn default() -> Self {
        use rand::{distributions::Alphanumeric, Rng};
        let mut rng = rand::thread_rng();
        Self {
            enabled: true,
            port: rng.gen_range(41000..48000),
            token: (&mut rng).sample_iter(&Alphanumeric).take(24).map(char::from).collect(),
            backup_dir: String::new(),
        }
    }
}

impl Default for AfinaSettings {
    fn default() -> Self {
        Self { enabled: true, provider: "anthropic".into(), model: "claude-opus-5-5".into(), base_url: String::new() }
    }
}

impl Default for RecordingSettings {
    fn default() -> Self {
        Self { audio: "system".into(), folder: String::new() }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    pub value: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(dir: PathBuf) -> Self {
        let path = dir.join("settings.json");
        let value = fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        let store = Self { path, value: Mutex::new(value) };
        // Persist right away so the randomly chosen port and token stay stable.
        let _ = store.save();
        store
    }

    pub fn get(&self) -> Settings {
        self.value.lock().unwrap().clone()
    }

    pub fn set(&self, s: Settings) -> std::io::Result<()> {
        *self.value.lock().unwrap() = s;
        self.save()
    }

    fn save(&self) -> std::io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(&*self.value.lock().unwrap())?)?;
        fs::rename(tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_fill_missing_fields() {
        let s: Settings = serde_json::from_str(r#"{"language":"ru","planner":{"port":45000}}"#).unwrap();
        assert_eq!(s.language, "ru");
        assert_eq!(s.planner.port, 45000);
        assert!(s.planner.token.len() == 24, "missing token gets generated");
        assert_eq!(s.hotkey, "Alt+Space");
    }

    #[test]
    fn roundtrip_on_disk() {
        let dir = std::env::temp_dir().join(format!("eh-settings-{}", std::process::id()));
        let store = SettingsStore::load(dir.clone());
        let mut s = store.get();
        s.do_not_disturb = true;
        store.set(s).unwrap();
        let again = SettingsStore::load(dir.clone());
        assert!(again.get().do_not_disturb);
        let _ = std::fs::remove_dir_all(dir);
    }
}
