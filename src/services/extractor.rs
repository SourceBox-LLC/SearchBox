//! Document text extractor. Dispatch is by file extension; unknown types
//! return an empty content string rather than erroring so callers can still
//! index the filename.

use std::io::Read;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use serde::Serialize;

#[derive(Debug, Serialize, Clone, Default)]
pub struct ExtractedDoc {
    pub content: Option<String>,
    pub filename: Option<String>,
    pub file_type: Option<String>,
    /// Per-extracted-image placeholder — we expose the count only for now;
    /// thumbnail generation + disk-side storage is a follow-up.
    pub images: Option<Vec<serde_json::Value>>,
    pub error: Option<String>,
}

pub async fn extract_text(path: &Path) -> Result<ExtractedDoc> {
    let path = path.to_path_buf();
    // Keep the extractor off the async runtime — parsers are synchronous
    // and can be slow on big files.
    tokio::task::spawn_blocking(move || extract_sync(&path))
        .await
        .map_err(|e| anyhow!("join extractor: {e}"))?
}

pub async fn batch_extract(paths: &[PathBuf]) -> Result<Vec<ExtractedDoc>> {
    let paths = paths.to_vec();
    tokio::task::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|p| {
                extract_sync(&p).unwrap_or_else(|e| ExtractedDoc {
                    filename: p
                        .file_name()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string()),
                    error: Some(e.to_string()),
                    ..Default::default()
                })
            })
            .collect()
    })
    .await
    .map_err(|e| anyhow!("join batch extractor: {e}"))
}

fn extract_sync(path: &Path) -> Result<ExtractedDoc> {
    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string());
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();

    let content = match ext.as_str() {
        "txt" | "log" | "csv" | "tsv" | "json" | "xml" | "yaml" | "yml" | "toml" | "ini"
        | "cfg" | "conf" | "env" | "rs" | "py" | "js" | "ts" | "tsx" | "jsx" | "go" | "java"
        | "rb" | "php" | "c" | "h" | "cpp" | "hpp" | "cs" | "sh" | "bash" | "ps1" | "sql"
        | "graphql" | "proto" => read_text_file(path)?,
        "md" | "markdown" | "rst" => read_markdown(path)?,
        "pdf" => read_pdf(path),
        "docx" => read_docx(path)?,
        "xlsx" | "xls" => read_xlsx(path)?,
        "html" | "htm" => read_html(path)?,
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" => String::new(),
        _ => read_text_file(path).unwrap_or_default(),
    };

    let is_image = matches!(
        ext.as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg"
    );
    let images = if is_image {
        Some(vec![serde_json::json!({
            "filename": filename.clone().unwrap_or_default(),
        })])
    } else {
        None
    };

    Ok(ExtractedDoc {
        content: Some(content),
        filename,
        file_type: Some(ext),
        images,
        error: None,
    })
}

// ── Text / Markdown / HTML ────────────────────────────────────────────────

fn read_text_file(path: &Path) -> Result<String> {
    let bytes = std::fs::read(path)?;
    if let Ok(s) = std::str::from_utf8(&bytes) {
        return Ok(s.to_string());
    }
    // Fall back to Windows-1252 / Latin-1 for legacy encodings.
    let (cow, _, _) = encoding_rs::WINDOWS_1252.decode(&bytes);
    Ok(cow.into_owned())
}

fn read_markdown(path: &Path) -> Result<String> {
    let src = read_text_file(path)?;
    // Strip formatting so search hits match the prose, not the punctuation.
    use pulldown_cmark::{Event, Parser};
    let mut out = String::with_capacity(src.len());
    for event in Parser::new(&src) {
        match event {
            Event::Text(t) | Event::Code(t) => {
                out.push_str(&t);
                out.push(' ');
            }
            Event::SoftBreak | Event::HardBreak => out.push('\n'),
            _ => {}
        }
    }
    Ok(out)
}

fn read_html(path: &Path) -> Result<String> {
    let src = read_text_file(path)?;
    let doc = scraper::Html::parse_document(&src);
    let text: String = doc.root_element().text().collect::<Vec<_>>().join(" ");
    Ok(collapse_ws(&text))
}

// ── PDF ───────────────────────────────────────────────────────────────────

fn read_pdf(path: &Path) -> String {
    match pdf_extract::extract_text(path) {
        Ok(s) => collapse_ws(&s),
        Err(e) => {
            tracing::warn!("pdf extract failed for {}: {e}", path.display());
            String::new()
        }
    }
}

// ── DOCX ──────────────────────────────────────────────────────────────────

fn read_docx(path: &Path) -> Result<String> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| anyhow!("docx open: {e}"))?;
    let mut xml = String::new();
    zip.by_name("word/document.xml")
        .map_err(|e| anyhow!("docx missing document.xml: {e}"))?
        .read_to_string(&mut xml)?;

    // Every <w:t>…</w:t> is a text run. Paragraphs become line breaks.
    use quick_xml::events::Event;
    use quick_xml::reader::Reader;
    let mut reader = Reader::from_str(&xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) if e.name().as_ref() == b"w:t" => in_text = true,
            Ok(Event::End(e)) if e.name().as_ref() == b"w:t" => in_text = false,
            Ok(Event::Start(e)) if e.name().as_ref() == b"w:p" => out.push(' '),
            Ok(Event::End(e)) if e.name().as_ref() == b"w:p" => out.push('\n'),
            Ok(Event::Text(t)) if in_text => {
                out.push_str(&t.unescape().unwrap_or_default());
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(anyhow!("docx parse: {e}")),
            _ => {}
        }
        buf.clear();
    }
    Ok(collapse_ws(&out))
}

// ── XLSX ──────────────────────────────────────────────────────────────────

fn read_xlsx(path: &Path) -> Result<String> {
    use calamine::{Data, Reader};
    let mut wb: calamine::Xlsx<_> = match calamine::open_workbook(path) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!("xlsx open failed for {}: {e}", path.display());
            return Ok(String::new());
        }
    };
    let mut out = String::new();
    for name in wb.sheet_names().into_iter().collect::<Vec<_>>() {
        if let Ok(range) = wb.worksheet_range(&name) {
            for row in range.rows() {
                for cell in row {
                    match cell {
                        Data::String(s) => {
                            out.push_str(s);
                            out.push(' ');
                        }
                        Data::Float(n) => {
                            out.push_str(&n.to_string());
                            out.push(' ');
                        }
                        Data::Int(n) => {
                            out.push_str(&n.to_string());
                            out.push(' ');
                        }
                        Data::Bool(b) => {
                            out.push_str(if *b { "true " } else { "false " });
                        }
                        _ => {}
                    }
                }
                out.push('\n');
            }
        }
    }
    Ok(out)
}

fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapse_ws_basic() {
        assert_eq!(collapse_ws("  hello   world  "), "hello world");
    }

    #[test]
    fn collapse_ws_tabs_and_newlines() {
        assert_eq!(collapse_ws("line1\n\n\tline2"), "line1 line2");
    }

    #[test]
    fn collapse_ws_empty() {
        assert_eq!(collapse_ws(""), "");
        assert_eq!(collapse_ws("   "), "");
    }

    #[test]
    fn read_markdown_strips_formatting() {
        let md = "# Hello\n\n**bold** and *italic*\n\n- item 1\n- item 2";
        let tmp = std::env::temp_dir().join("searchbox-test-md.md");
        std::fs::write(&tmp, md).unwrap();
        let result = read_markdown(&tmp).unwrap();
        assert!(result.contains("Hello"));
        assert!(result.contains("bold"));
        assert!(result.contains("italic"));
        assert!(!result.contains("**"));
        assert!(!result.contains("*"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn read_html_extracts_text() {
        let html = "<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>";
        let tmp = std::env::temp_dir().join("searchbox-test-html.html");
        std::fs::write(&tmp, html).unwrap();
        let result = read_html(&tmp).unwrap();
        assert!(result.contains("Title"));
        assert!(result.contains("Hello"));
        assert!(result.contains("world"));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn read_text_file_utf8() {
        let tmp = std::env::temp_dir().join("searchbox-test-utf8.txt");
        std::fs::write(&tmp, "hello world").unwrap();
        let result = read_text_file(&tmp).unwrap();
        assert_eq!(result, "hello world");
        let _ = std::fs::remove_file(&tmp);
    }
}
