//! Universal Planner connector.
//!
//! Two one-way channels, no changes needed in the Planner itself:
//! 1. Live events: Planner → Settings → Connectors → Webhook (Custom) posts JSON to
//!    `http://127.0.0.1:<port>/planner/<token>`. We show them in the island.
//! 2. Today's data: Planner's "Backup folder" connector writes a daily JSON backup; we read the newest one.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannerEvent {
    pub event: String,
    pub text: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub at: String,
}

#[derive(Default)]
pub struct PlannerState {
    pub recent: Mutex<Vec<PlannerEvent>>,
    pub bound_port: Mutex<Option<u16>>,
}

/// Parses the body Universal Planner sends for "custom" webhooks.
pub fn parse_webhook(body: &str) -> Option<PlannerEvent> {
    let v: Value = serde_json::from_str(body).ok()?;
    let event = v.get("event")?.as_str()?.to_string();
    let s = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    Some(PlannerEvent { event, text: s("text"), title: s("title"), at: s("at") })
}

fn cors(mut r: tiny_http::Response<std::io::Cursor<Vec<u8>>>) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    for (k, v) in [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "POST, GET, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type"),
        // Chrome's Private Network Access check, for the Planner web app in a browser.
        ("Access-Control-Allow-Private-Network", "true"),
    ] {
        r.add_header(tiny_http::Header::from_bytes(k, v).unwrap());
    }
    r
}

/// Starts the local receiver. Listens on 127.0.0.1 only, never on the network.
pub fn start_server(app: AppHandle, state: Arc<PlannerState>, port: u16, token: String) {
    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("planner receiver: port {port} unavailable: {e}");
                let _ = app.emit("planner://server", serde_json::json!({ "ok": false, "error": e.to_string() }));
                return;
            }
        };
        *state.bound_port.lock().unwrap() = Some(port);
        let path = format!("/planner/{token}");
        for mut req in server.incoming_requests() {
            let url = req.url().split('?').next().unwrap_or("").to_string();
            let resp = match (req.method(), url.as_str()) {
                (tiny_http::Method::Options, _) => tiny_http::Response::from_string("").with_status_code(204),
                (tiny_http::Method::Get, "/health") => tiny_http::Response::from_string(r#"{"app":"Eternal Helper","ok":true}"#),
                (tiny_http::Method::Post, p) if p == path => {
                    let mut body = String::new();
                    let _ = std::io::Read::take(req.as_reader(), 64 * 1024).read_to_string(&mut body);
                    match parse_webhook(&body) {
                        Some(ev) => {
                            {
                                let mut recent = state.recent.lock().unwrap();
                                recent.insert(0, ev.clone());
                                recent.truncate(20);
                            }
                            let _ = app.emit("planner://event", &ev);
                            tiny_http::Response::from_string(r#"{"ok":true}"#)
                        }
                        None => tiny_http::Response::from_string(r#"{"ok":false}"#).with_status_code(400),
                    }
                }
                _ => tiny_http::Response::from_string("not found").with_status_code(404),
            };
            let _ = req.respond(cors(resp));
        }
    });
}

use std::io::Read as _;

// ---------- Backup snapshot ----------

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerTask {
    pub id: String,
    pub title: String,
    pub priority: i64,
    pub top: bool,
    /// Epoch ms of a time-blocked slot, if any.
    pub start: Option<i64>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlannerItem {
    pub id: String,
    pub title: String,
    pub start: i64,
    pub end: i64,
    pub all_day: bool,
    pub location: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSnapshot {
    pub file: String,
    pub exported_at: String,
    pub tasks_today: Vec<PlannerTask>,
    pub done_today: usize,
    pub upcoming: Vec<PlannerItem>,
}

/// Newest `universal-planner-*.json` in the folder (names carry the date, so mtime breaks ties).
pub fn newest_backup(dir: &Path) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_lowercase();
            n.starts_with("universal-planner") && n.ends_with(".json")
        })
        .max_by_key(|e| e.metadata().and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH))
        .map(|e| e.path())
}

/// Builds today's view from a Planner backup. `today` is 'YYYY-MM-DD' local, `now`/`day_end` epoch ms.
pub fn snapshot_from(json: &str, today: &str, day_start: i64, now: i64) -> Result<PlannerSnapshot, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| format!("not JSON: {e}"))?;
    if v.get("app").and_then(Value::as_str).map_or(true, |a| !a.contains("universal")) && v.get("tables").is_none() {
        return Err("This file is not a Universal Planner backup.".into());
    }
    let empty = vec![];
    let table = |name: &str| v.pointer(&format!("/tables/{name}")).and_then(Value::as_array).unwrap_or(&empty).clone();
    let s = |o: &Value, k: &str| o.get(k).and_then(Value::as_str).map(str::to_string);
    let n = |o: &Value, k: &str| o.get(k).and_then(Value::as_f64).map(|f| f as i64);
    let day_end = day_start + 86_400_000;

    let mut tasks_today = vec![];
    let mut done_today = 0;
    for t in table("tasks") {
        let done = n(&t, "done").unwrap_or(0) == 1;
        let start = n(&t, "start");
        let is_today = s(&t, "due").as_deref() == Some(today)
            || s(&t, "status").as_deref() == Some("today")
            || start.is_some_and(|x| x >= day_start && x < day_end);
        if done {
            if n(&t, "doneAt").is_some_and(|x| x >= day_start && x < day_end) {
                done_today += 1;
            }
            continue;
        }
        if is_today {
            tasks_today.push(PlannerTask {
                id: s(&t, "id").unwrap_or_default(),
                title: s(&t, "title").unwrap_or_default(),
                priority: n(&t, "priority").unwrap_or(0),
                top: n(&t, "top").unwrap_or(0) == 1,
                start,
            });
        }
    }
    // Top three first, then timed tasks by time, then priority.
    tasks_today.sort_by_key(|t| (!t.top, t.start.unwrap_or(i64::MAX), -t.priority));

    // Single (non-repeating) events from now through the next 7 days.
    let horizon = now + 7 * 86_400_000;
    let mut upcoming: Vec<PlannerItem> = table("events")
        .iter()
        .filter(|e| e.get("rrule").map_or(true, Value::is_null))
        .filter_map(|e| {
            let (start, end) = (n(e, "start")?, n(e, "end")?);
            (end > now && start < horizon).then(|| PlannerItem {
                id: s(e, "id").unwrap_or_default(),
                title: s(e, "title").unwrap_or_default(),
                start,
                end,
                all_day: e.get("allDay").and_then(Value::as_bool).unwrap_or(false),
                location: s(e, "location"),
            })
        })
        .collect();
    upcoming.sort_by_key(|e| e.start);
    upcoming.truncate(10);

    Ok(PlannerSnapshot {
        file: String::new(),
        exported_at: s(&v, "exportedAt").unwrap_or_default(),
        tasks_today,
        done_today,
        upcoming,
    })
}

pub fn read_snapshot(dir: &str) -> Result<PlannerSnapshot, String> {
    if dir.trim().is_empty() {
        return Err("no-folder".into());
    }
    let file = newest_backup(Path::new(dir)).ok_or("no-backup")?;
    let json = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let now_local = chrono::Local::now();
    let today = now_local.format("%Y-%m-%d").to_string();
    let day_start = now_local
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|d| d.and_local_timezone(chrono::Local).earliest())
        .map(|d| d.timestamp_millis())
        .unwrap_or(0);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    let mut snap = snapshot_from(&json, &today, day_start, now)?;
    snap.file = file.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(snap)
}

/// Opens the installed Universal Planner desktop app, or the web app if it isn't installed.
pub fn open_planner(app: &AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    const WEB: &str = "https://z0nkerino.github.io/universal/";
    #[cfg(target_os = "macos")]
    {
        if std::process::Command::new("open").args(["-a", "Universal Planner"]).status().is_ok_and(|s| s.success()) {
            return;
        }
    }
    #[cfg(windows)]
    {
        if let Some(local) = dirs::data_local_dir() {
            let exe = local.join("Programs").join("Universal Planner").join("Universal Planner.exe");
            if exe.exists() && std::process::Command::new(exe).spawn().is_ok() {
                return;
            }
        }
    }
    let _ = app.opener().open_url(WEB, None::<&str>);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_custom_webhook() {
        let ev = parse_webhook(r#"{"event":"task.completed","text":"Task completed: Gym","title":"Gym","at":"2026-11-11T10:00:00Z","app":"Universal Planner","data":{}}"#).unwrap();
        assert_eq!(ev.event, "task.completed");
        assert_eq!(ev.title, "Gym");
        assert!(parse_webhook("{}").is_none());
        assert!(parse_webhook("nope").is_none());
    }

    #[test]
    fn builds_today_view() {
        let day = 1_762_819_200_000_i64; // some local midnight
        let json = serde_json::json!({
            "app": "universal-planner", "exportedAt": "2026-11-11T08:00:00Z",
            "tables": {
                "tasks": [
                    { "id": "a", "title": "Due today", "due": "2026-11-11", "done": 0, "priority": 1 },
                    { "id": "b", "title": "Top", "status": "today", "done": 0, "priority": 0, "top": 1 },
                    { "id": "c", "title": "Done", "due": "2026-11-11", "done": 1, "doneAt": day + 1000 },
                    { "id": "d", "title": "Tomorrow", "due": "2026-11-12", "done": 0 }
                ],
                "events": [
                    { "id": "e1", "title": "Call", "start": day + 3_600_000 * 15, "end": day + 3_600_000 * 16 },
                    { "id": "e2", "title": "Past", "start": day - 7_200_000, "end": day - 3_600_000 },
                    { "id": "e3", "title": "Weekly", "start": day + 3_600_000, "end": day + 7_200_000, "rrule": { "freq": "weekly" } }
                ]
            }
        });
        let snap = snapshot_from(&json.to_string(), "2026-11-11", day, day + 3_600_000 * 9).unwrap();
        let titles: Vec<_> = snap.tasks_today.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles, ["Top", "Due today"]);
        assert_eq!(snap.done_today, 1);
        assert_eq!(snap.upcoming.len(), 1);
        assert_eq!(snap.upcoming[0].title, "Call");
    }

    #[test]
    fn rejects_other_json() {
        assert!(snapshot_from(r#"{"hello":1}"#, "2026-11-11", 0, 0).is_err());
    }
}
