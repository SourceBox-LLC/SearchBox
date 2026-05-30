// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 SourceBox LLC
//
// Windows-only build script: stamps the exe with version metadata and
// embeds the icon so File Explorer, taskbar, Alt-Tab, and every
// shortcut the MSI drops show a real logo instead of the generic Rust
// default. No-op on other platforms.

fn main() {
    #[cfg(windows)]
    {
        // The icon lives under wix\assets\searchbox.ico and is regenerated
        // by wix\make-icon.ps1. When packaging on CI or locally, build.ps1
        // runs make-icon.ps1 before `cargo build`, so the file exists by
        // the time we reach here. If a developer runs `cargo build`
        // directly without having produced the icon first, we skip
        // silently rather than fail — the exe just ships iconless.
        let icon_path = std::path::Path::new("wix")
            .join("assets")
            .join("searchbox.ico");
        if !icon_path.exists() {
            println!(
                "cargo:warning=wix/assets/searchbox.ico not found; skipping icon embed. \
                Run `wix\\make-icon.ps1` (or `wix\\build.ps1`) to produce it."
            );
            return;
        }

        let mut res = winresource::WindowsResource::new();
        res.set_icon(icon_path.to_str().unwrap());
        // These show up on right-click → Properties → Details.
        res.set(
            "FileDescription",
            "SearchBox — private local-first document search",
        );
        res.set("ProductName", "SearchBox");
        res.set("CompanyName", "SourceBox LLC");
        res.set("LegalCopyright", "Copyright (c) 2026 SourceBox LLC");
        if let Err(e) = res.compile() {
            // Don't hard-fail the build on resource-compiler issues —
            // emit a warning so devs see it, but still produce a working
            // (iconless) binary.
            println!("cargo:warning=winresource::compile failed: {e}");
        }

        // Re-run build.rs when the icon or this script itself changes.
        println!("cargo:rerun-if-changed=wix/assets/searchbox.ico");
        println!("cargo:rerun-if-changed=build.rs");
    }
}
