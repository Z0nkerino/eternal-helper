//! Afina's computer tools: find files by name and find text inside documents, then open or reveal them.
//! They only run while the user has turned on "Let Afina use this computer" (checked here, not just in
//! the UI), only read the user's own folders, and never send anything anywhere by themselves.
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub path: String,
    pub name: String,
    /// Matching line for text searches.
    pub snippet: Option<String>,
    pub modified: i64,
}

pub fn allowed(settings: &crate::settings::Settings) -> bool {
    settings.extra.get("afinaTools").and_then(|c| c.get("enabled")).and_then(|v| v.as_bool()).unwrap_or(false)
}

/// The folders Afina may look in: the user's own, never system folders.
pub fn roots() -> Vec<PathBuf> {
    let mut r: Vec<PathBuf> = [dirs::desktop_dir(), dirs::document_dir(), dirs::download_dir(), dirs::picture_dir(), dirs::video_dir(), dirs::audio_dir()].into_iter().flatten().collect();
    if let Some(h) = dirs::home_dir() {
        for extra in ["OneDrive", "iCloud Drive", "Projects", "projects", "Dropbox"] {
            let p = h.join(extra);
            if p.is_dir() {
                r.push(p);
            }
        }
    }
    r.sort();
    r.dedup();
    r
}

const SKIP: [&str; 9] = ["node_modules", "target", ".git", "AppData", "Library", "$RECYCLE.BIN", "venv", ".cache", "__pycache__"];
const TEXT_EXT: [&str; 16] = ["txt", "md", "markdown", "csv", "json", "log", "html", "htm", "xml", "yaml", "yml", "ini", "rtf", "tex", "js", "ts"];

fn words(q: &str) -> Vec<String> {
    q.to_lowercase().split_whitespace().filter(|w| w.len() > 1).map(str::to_string).collect()
}

fn walk(dir: &Path, depth: usize, deadline: Instant, visit: &mut dyn FnMut(&Path) -> bool) -> bool {
    if depth > 7 || Instant::now() > deadline {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return true };
    for e in entries.filter_map(Result::ok) {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || SKIP.contains(&name.as_str()) {
            continue;
        }
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            if !walk(&p, depth + 1, deadline, visit) {
                return false;
            }
        } else if !visit(&p) {
            return false;
        }
    }
    true
}

fn found(p: &Path, snippet: Option<String>) -> Found {
    let modified = std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64).unwrap_or(0);
    Found { path: p.to_string_lossy().into_owned(), name: p.file_name().unwrap_or_default().to_string_lossy().into_owned(), snippet, modified }
}

/// Files whose name contains every word of the query. Newest first; at most `limit`, within ~2.5 s.
pub fn find_files(roots: &[PathBuf], query: &str, limit: usize) -> Vec<Found> {
    let w = words(query);
    if w.is_empty() {
        return vec![];
    }
    #[cfg(target_os = "macos")]
    {
        // Spotlight is instant and already indexed; fall back to walking if it returns nothing.
        if let Some(out) = std::process::Command::new("/usr/bin/mdfind").args(["-onlyin", &dirs::home_dir().unwrap_or_default().to_string_lossy(), "-name", &w[0]]).output().ok().filter(|o| o.status.success()) {
            let mut v: Vec<Found> = String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(Path::new)
                .filter(|p| {
                    let n = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                    w.iter().all(|x| n.contains(x)) && !p.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.') || c.as_os_str() == "Library")
                })
                .take(limit * 3)
                .map(|p| found(p, None))
                .collect();
            if !v.is_empty() {
                v.sort_by_key(|f| -f.modified);
                v.truncate(limit);
                return v;
            }
        }
    }
    let deadline = Instant::now() + Duration::from_millis(2500);
    let mut out = vec![];
    for r in roots {
        let more = walk(r, 0, deadline, &mut |p| {
            let n = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            if w.iter().all(|x| n.contains(x)) {
                out.push(found(p, None));
            }
            out.len() < limit * 4
        });
        if !more {
            break;
        }
    }
    out.sort_by_key(|f| -f.modified);
    out.truncate(limit);
    out
}

/// Text documents containing the phrase (case-insensitive), with the matching line. Within ~4 s.
pub fn find_text(roots: &[PathBuf], phrase: &str, limit: usize) -> Vec<Found> {
    let needle = phrase.trim().to_lowercase();
    if needle.chars().count() < 2 {
        return vec![];
    }
    let deadline = Instant::now() + Duration::from_millis(4000);
    let mut out = vec![];
    for r in roots {
        let more = walk(r, 0, deadline, &mut |p| {
            let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if !TEXT_EXT.contains(&ext.as_str()) || std::fs::metadata(p).map(|m| m.len() > 2_000_000).unwrap_or(true) {
                return true;
            }
            if let Ok(text) = std::fs::read_to_string(p) {
                if let Some(line) = text.lines().find(|l| l.to_lowercase().contains(&needle)) {
                    let snippet: String = line.trim().chars().take(160).collect();
                    out.push(found(p, Some(snippet)));
                }
            }
            out.len() < limit
        });
        if !more {
            break;
        }
    }
    out.sort_by_key(|f| -f.modified);
    out
}

/// Only paths inside the allowed folders may be opened by Afina.
pub fn inside_roots(roots: &[PathBuf], path: &str) -> bool {
    let Ok(p) = Path::new(path).canonicalize() else { return false };
    roots.iter().filter_map(|r| r.canonicalize().ok()).any(|r| p.starts_with(r))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_names_and_text_but_not_hidden() {
        let root = std::env::temp_dir().join(format!("eh-afina-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("docs/deep")).unwrap();
        std::fs::create_dir_all(root.join(".secret")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::write(root.join("docs/Quarterly Report 2026.txt"), "Revenue grew\nThe launch date is March 3\n").unwrap();
        std::fs::write(root.join("docs/deep/notes.md"), "# Ideas\nCloudy should eat rainbows\n").unwrap();
        std::fs::write(root.join(".secret/report.txt"), "launch date hidden").unwrap();
        std::fs::write(root.join("node_modules/report.txt"), "launch date dep").unwrap();
        let roots = vec![root.clone()];

        let f = find_files(&roots, "report 2026", 10);
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].name, "Quarterly Report 2026.txt");

        let t = find_text(&roots, "LAUNCH DATE", 10);
        assert_eq!(t.len(), 1, "hidden folders and node_modules are skipped");
        assert_eq!(t[0].snippet.as_deref(), Some("The launch date is March 3"));
        assert_eq!(find_text(&roots, "rainbows", 10)[0].name, "notes.md");

        assert!(inside_roots(&roots, &f[0].path));
        assert!(!inside_roots(&roots, "/etc/hosts"));
        let _ = std::fs::remove_dir_all(root);
    }
}
