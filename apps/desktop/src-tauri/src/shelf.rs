//! The shelf: files dropped on the island are copied here (Documents/Eternal Helper/Shelf) and listed in
//! the island until removed. Copies, so moving or deleting the original never loses the shelf's file.
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub is_dir: bool,
}

pub fn dir() -> PathBuf {
    dirs::document_dir().or_else(dirs::home_dir).unwrap_or_else(std::env::temp_dir).join("Eternal Helper").join("Shelf")
}

/// A name inside the shelf; never a path that climbs out of it.
fn inside(name: &str) -> Result<PathBuf, String> {
    let n = Path::new(name);
    if name.is_empty() || n.components().count() != 1 || name.contains(['/', '\\']) || name == ".." || name == "." {
        return Err("bad name".into());
    }
    Ok(dir().join(n))
}

fn size_of(p: &Path) -> u64 {
    if p.is_dir() {
        std::fs::read_dir(p).map(|r| r.flatten().map(|e| size_of(&e.path())).sum()).unwrap_or(0)
    } else {
        p.metadata().map(|m| m.len()).unwrap_or(0)
    }
}

pub fn list() -> Vec<Item> {
    let Ok(rd) = std::fs::read_dir(dir()) else { return vec![] };
    let mut out: Vec<Item> = rd
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| {
            let p = e.path();
            let modified = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            Item { name: e.file_name().to_string_lossy().to_string(), path: p.to_string_lossy().to_string(), size: size_of(&p), modified, is_dir: p.is_dir() }
        })
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// "report.pdf" → "report (2).pdf" until the name is free.
fn free_name(base: &Path) -> PathBuf {
    if !base.exists() {
        return base.to_path_buf();
    }
    let stem = base.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = base.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (2..).map(|i| base.with_file_name(format!("{stem} ({i}){ext}"))).find(|p| !p.exists()).unwrap()
}

fn copy_all(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for e in std::fs::read_dir(from)?.flatten() {
            copy_all(&e.path(), &to.join(e.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(from, to).map(|_| ())
    }
}

/// Copies the dropped files in; returns how many were added.
pub fn add(paths: &[String]) -> Result<usize, String> {
    let d = dir();
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let mut n = 0;
    for p in paths {
        let src = PathBuf::from(p);
        // Something already on the shelf, dropped again: nothing to do.
        if src.starts_with(&d) || !src.exists() {
            continue;
        }
        let Some(name) = src.file_name() else { continue };
        copy_all(&src, &free_name(&d.join(name))).map_err(|e| format!("{}: {e}", name.to_string_lossy()))?;
        n += 1;
    }
    Ok(n)
}

pub fn remove(name: &str) -> Result<(), String> {
    let p = inside(name)?;
    if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) }.map_err(|e| e.to_string())
}

pub fn path(name: &str) -> Result<PathBuf, String> {
    let p = inside(name)?;
    p.exists().then_some(p).ok_or_else(|| "not found".into())
}

/// Copies a shelf item to Desktop or Downloads.
pub fn export(name: &str, to: &str) -> Result<String, String> {
    let src = path(name)?;
    let base = match to {
        "desktop" => dirs::desktop_dir(),
        _ => dirs::download_dir(),
    }
    .ok_or("folder not found")?;
    let dst = free_name(&base.join(src.file_name().unwrap()));
    copy_all(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().to_string())
}

/// Copies dropped files straight to the Desktop (the second half of the drop split).
pub fn to_desktop(paths: &[String]) -> Result<usize, String> {
    let d = dirs::desktop_dir().ok_or("Desktop not found")?;
    let mut n = 0;
    for p in paths {
        let src = PathBuf::from(p);
        let Some(name) = src.file_name() else { continue };
        if !src.exists() || src.parent() == Some(d.as_path()) {
            continue;
        }
        copy_all(&src, &free_name(&d.join(name))).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_paths_outside() {
        assert!(inside("../x").is_err());
        assert!(inside("a/b").is_err());
        assert!(inside("..").is_err());
        assert!(inside("").is_err());
        assert!(inside("file.txt").is_ok());
    }
    #[test]
    fn picks_free_names() {
        let d = std::env::temp_dir().join(format!("eh-shelf-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("a.txt"), "1").unwrap();
        assert_eq!(free_name(&d.join("a.txt")).file_name().unwrap(), "a (2).txt");
        assert_eq!(free_name(&d.join("b.txt")).file_name().unwrap(), "b.txt");
        let _ = std::fs::remove_dir_all(&d);
    }
}
