//! API keys in the OS keychain (Windows Credential Manager / macOS Keychain / Secret Service).
const SERVICE: &str = "com.eternalinc.helper";

pub fn set(name: &str, value: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())?;
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(value).map_err(|e| e.to_string())
    }
}

pub fn get(name: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, name).ok()?.get_password().ok().filter(|s| !s.is_empty())
}
