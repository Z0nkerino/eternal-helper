//! Afina's language-model bridge. Afina's own rules engine runs in the UI; this is only used for what
//! the rules can't answer, and only with the user's own key (kept in the system keychain).
use crate::{secrets, settings::AfinaSettings};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

const SYSTEM: &str = "You are Afina, the assistant of Eternal Inc., living in the Eternal Helper desktop island \
(and also in Universal Planner). Be warm, brief and concrete: 1–4 short sentences unless asked for more, plain text \
without Markdown headings. Answer in the user's language (Russian or English). The context block tells you the \
local time and what is on the user's Universal Planner today; use it when relevant and never invent tasks.";

pub fn key_name(provider: &str) -> String {
    format!("afina-{provider}")
}

fn client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder().timeout(Duration::from_secs(90)).build().expect("http client")
}

/// Claude 5-generation models accept `effort` and server-side refusal fallbacks.
fn is_claude_5(model: &str) -> bool {
    ["claude-opus-5", "claude-sonnet-5", "claude-haiku-5", "claude-fable-5"].iter().any(|p| model.starts_with(p))
}

pub fn anthropic_body(model: &str, context: &str, history: &[ChatMessage]) -> Value {
    let messages: Vec<Value> = history.iter().map(|m| json!({ "role": m.role, "content": m.content })).collect();
    let mut body = json!({
        "model": model,
        "max_tokens": 4096,
        "system": format!("{SYSTEM}\n\n<context>\n{context}\n</context>"),
        "messages": messages,
    });
    if is_claude_5(model) {
        // Chat in a small island: keep answers quick.
        body["output_config"] = json!({ "effort": "low" });
        body["fallbacks"] = json!("default");
    }
    body
}

pub fn anthropic_text(v: &Value) -> Result<String, String> {
    if let Some(err) = v.pointer("/error/message").and_then(Value::as_str) {
        return Err(err.to_string());
    }
    if v.get("stop_reason").and_then(Value::as_str) == Some("refusal") {
        return Err("refusal".into());
    }
    let text: String = v
        .get("content")
        .and_then(Value::as_array)
        .map(|blocks| blocks.iter().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
    if text.trim().is_empty() { Err("empty".into()) } else { Ok(text) }
}

pub fn ask(cfg: &AfinaSettings, context: &str, history: &[ChatMessage]) -> Result<String, String> {
    let key = secrets::get(&key_name(&cfg.provider));
    match cfg.provider.as_str() {
        "anthropic" => {
            let key = key.ok_or("no-key")?;
            let model = if cfg.model.is_empty() { "claude-opus-5-5" } else { &cfg.model };
            let mut req = client()
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", key)
                .header("anthropic-version", "2026-10-21")
                .header("content-type", "application/json");
            if is_claude_5(model) {
                req = req.header("anthropic-beta", "server-side-fallback-2026-07-01");
            }
            let v: Value = req.json(&anthropic_body(model, context, history)).send().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())?;
            anthropic_text(&v)
        }
        "openai" | "ollama" => {
            let ollama = cfg.provider == "ollama";
            let base = if !cfg.base_url.trim().is_empty() {
                cfg.base_url.trim().trim_end_matches('/').to_string()
            } else if ollama {
                "http://127.0.0.1:11434".into()
            } else {
                "https://api.openai.com".into()
            };
            let mut messages = vec![json!({ "role": "system", "content": format!("{SYSTEM}\n\nContext:\n{context}") })];
            messages.extend(history.iter().map(|m| json!({ "role": m.role, "content": m.content })));
            let (url, body) = if ollama {
                (format!("{base}/api/chat"), json!({ "model": cfg.model, "messages": messages, "stream": false }))
            } else {
                (format!("{base}/v1/chat/completions"), json!({ "model": cfg.model, "messages": messages }))
            };
            let mut req = client().post(url).json(&body);
            if let Some(k) = key {
                req = req.bearer_auth(k);
            } else if !ollama {
                return Err("no-key".into());
            }
            let v: Value = req.send().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())?;
            if let Some(err) = v.pointer("/error/message").and_then(Value::as_str).or_else(|| v.get("error").and_then(Value::as_str)) {
                return Err(err.to_string());
            }
            v.pointer(if ollama { "/message/content" } else { "/choices/0/message/content" })
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| "empty".into())
        }
        _ => Err("off".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_claude_request() {
        let h = vec![ChatMessage { role: "user".into(), content: "Привет".into() }];
        let b = anthropic_body("claude-opus-5-5", "time: 10:00", &h);
        assert_eq!(b["messages"][0]["content"], "Привет");
        assert_eq!(b["output_config"]["effort"], "low");
        assert!(b["system"].as_str().unwrap().contains("time: 10:00"));
        let old = anthropic_body("claude-haiku-4-5", "", &h);
        assert!(old.get("output_config").is_none());
    }

    #[test]
    fn reads_claude_response() {
        let ok = json!({ "content": [{ "type": "thinking", "thinking": "" }, { "type": "text", "text": "Hi" }], "stop_reason": "end_turn" });
        assert_eq!(anthropic_text(&ok).unwrap(), "Hi");
        assert_eq!(anthropic_text(&json!({ "stop_reason": "refusal", "content": [] })).unwrap_err(), "refusal");
        assert!(anthropic_text(&json!({ "error": { "message": "bad key" } })).is_err());
    }
}
