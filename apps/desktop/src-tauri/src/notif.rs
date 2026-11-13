//! Notifications from every app on the PC (Windows 10/11 notification listener). The user allows it once
//! in Windows (Settings → Privacy → Notifications); then new toasts are relayed to the island as they
//! arrive. Nothing is stored by the app beyond what the island shows. macOS has no public API for this.
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub id: u32,
    pub app: String,
    pub title: String,
    pub body: String,
    pub at: u64,
}

/// "allowed", "denied", "ask" or "unsupported".
pub fn status() -> String {
    imp::status()
}

pub fn request() -> String {
    imp::request()
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        crate::platform::init_thread();
        let mut seen = std::collections::HashSet::<u32>::new();
        let mut first = true;
        loop {
            if imp::status() == "allowed" {
                if let Some(list) = imp::current() {
                    let ids: std::collections::HashSet<u32> = list.iter().map(|n| n.id).collect();
                    for n in list {
                        // The ones already on screen when the app starts aren't "new".
                        if !seen.contains(&n.id) && !first {
                            let _ = app.emit("notif://new", &n);
                        }
                    }
                    seen = ids;
                    first = false;
                }
                std::thread::sleep(std::time::Duration::from_millis(1500));
            } else {
                std::thread::sleep(std::time::Duration::from_secs(10));
            }
        }
    });
}

#[cfg(windows)]
mod imp {
    use super::Incoming;
    use ::windows::UI::Notifications::{
        KnownNotificationBindings,
        Management::{UserNotificationListener, UserNotificationListenerAccessStatus as St},
        NotificationKinds,
    };

    fn listener() -> Option<UserNotificationListener> {
        UserNotificationListener::Current().ok()
    }

    pub fn status() -> String {
        match listener().and_then(|l| l.GetAccessStatus().ok()) {
            Some(St::Allowed) => "allowed",
            Some(St::Denied) => "denied",
            Some(_) => "ask",
            None => "unsupported",
        }
        .into()
    }

    pub fn request() -> String {
        if let Some(l) = listener() {
            let _ = l.RequestAccessAsync().and_then(|op| op.get());
        }
        status()
    }

    pub fn current() -> Option<Vec<Incoming>> {
        let l = listener()?;
        let list = l.GetNotificationsAsync(NotificationKinds::Toast).ok()?.get().ok()?;
        let mut out = vec![];
        for n in list {
            let Ok(id) = n.Id() else { continue };
            let app = n.AppInfo().and_then(|a| a.DisplayInfo()).and_then(|d| d.DisplayName()).map(|s| s.to_string()).unwrap_or_default();
            let texts: Vec<String> = n
                .Notification()
                .and_then(|x| x.Visual())
                .and_then(|v| v.GetBinding(&KnownNotificationBindings::ToastGeneric()?))
                .and_then(|b| b.GetTextElements())
                .map(|els| els.into_iter().filter_map(|t| t.Text().ok().map(|h| h.to_string())).collect())
                .unwrap_or_default();
            // DateTime: 100 ns since 1601.
            let at = n.CreationTime().map(|d| ((d.UniversalTime - 116_444_736_000_000_000).max(0) / 10_000) as u64).unwrap_or(0);
            let title = texts.first().cloned().unwrap_or_default();
            let body = texts.iter().skip(1).cloned().collect::<Vec<_>>().join("\n");
            out.push(Incoming { id, app, title: title.chars().take(160).collect(), body: body.chars().take(500).collect(), at });
        }
        Some(out)
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Incoming;
    pub fn status() -> String {
        "unsupported".into()
    }
    pub fn request() -> String {
        status()
    }
    pub fn current() -> Option<Vec<Incoming>> {
        None
    }
}
