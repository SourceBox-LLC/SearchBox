//! Opt-in update check against the project's GitHub Releases, and (on Windows)
//! launching the freshly-downloaded MSI. The app makes NO outbound request
//! unless the user enables auto-check or explicitly clicks "Check for updates"
//! — keeping the "nothing leaves your machine by default" promise.

use anyhow::Result;
use serde::Deserialize;

const REPO: &str = "SourceBox-LLC/SearchBox";

/// This build's version (from Cargo.toml).
pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

/// Pick the MSI matching this build's architecture, so an ARM64 install updates
/// to the ARM64 MSI (and x64 to x64).
#[cfg(target_arch = "aarch64")]
const ARCH_SUFFIX: &str = "aarch64";
#[cfg(not(target_arch = "aarch64"))]
const ARCH_SUFFIX: &str = "x86_64";

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

pub struct LatestRelease {
    /// Version without the leading `v` (e.g. "0.3.0").
    pub version: String,
    pub release_url: String,
    /// Download URL of the MSI matching this architecture, if the release has one.
    pub msi_url: Option<String>,
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent(format!("SearchBox/{CURRENT}"))
        .build()?)
}

/// Query GitHub for the latest published release.
pub async fn latest_release() -> Result<LatestRelease> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let rel: GhRelease = client()?
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let msi_url = rel
        .assets
        .iter()
        .find(|a| a.name.ends_with(&format!("{ARCH_SUFFIX}.msi")))
        .or_else(|| rel.assets.iter().find(|a| a.name.ends_with(".msi")))
        .map(|a| a.browser_download_url.clone());
    Ok(LatestRelease {
        version: rel.tag_name.trim_start_matches('v').to_string(),
        release_url: rel.html_url,
        msi_url,
    })
}

/// Numeric, per-component version parse, so `0.2.10` > `0.2.9` (a plain string
/// compare gets that wrong). A pre-release/build suffix on a component
/// (e.g. `1.2.3-rc1`) is truncated to its number.
fn parse_ver(v: &str) -> Vec<u64> {
    v.trim_start_matches('v')
        .split('.')
        .map(|p| p.split(['-', '+']).next().unwrap_or(""))
        .filter_map(|p| p.parse::<u64>().ok())
        .collect()
}

/// Is `latest` strictly newer than `current`? Unparseable `latest` → false.
pub fn is_newer(latest: &str, current: &str) -> bool {
    let (l, c) = (parse_ver(latest), parse_ver(current));
    !l.is_empty() && l > c
}

/// Lowercase hex SHA-256 of `bytes`. Gated to where it's actually used (the
/// Windows updater, and the test) so non-Windows builds don't flag it unused.
#[cfg(any(target_os = "windows", test))]
fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

/// Download the MSI to a temp file and launch the Windows Installer. Its restart
/// manager prompts to close the running app, then performs the in-place major
/// upgrade. Windows-only (the desktop install target).
#[cfg(target_os = "windows")]
pub async fn download_and_launch(msi_url: &str) -> Result<()> {
    let http = client()?;
    let bytes = http
        .get(msi_url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;

    // Verify the download against the published `<msi>.sha256` sidecar before
    // running the installer. Fetched over the same TLS channel from GitHub, this
    // catches a corrupted/truncated download or a swapped asset and refuses to
    // launch on mismatch. (TLS already authenticates the source; a signature
    // would add supply-chain protection but signing was intentionally skipped.)
    let sums = http
        .get(format!("{msi_url}.sha256"))
        .send()
        .await?
        .error_for_status()
        .map_err(|e| anyhow::anyhow!("update checksum unavailable: {e}"))?
        .text()
        .await?;
    let expected = sums
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if expected.is_empty() || expected != sha256_hex(&bytes) {
        return Err(anyhow::anyhow!(
            "update checksum mismatch — refusing to launch the installer"
        ));
    }

    let path = std::env::temp_dir().join("SearchBox-update.msi");
    std::fs::write(&path, &bytes)?;
    std::process::Command::new("msiexec")
        .arg("/i")
        .arg(&path)
        .spawn()?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub async fn download_and_launch(_msi_url: &str) -> Result<()> {
    Err(anyhow::anyhow!(
        "in-app update is only available on the Windows build"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_compare_is_numeric() {
        assert!(is_newer("0.3.0", "0.2.9"));
        assert!(is_newer("0.2.10", "0.2.9")); // numeric, not lexical
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("v0.3.0", "0.2.9")); // tolerates a leading 'v'
        assert!(!is_newer("0.2.9", "0.2.9"));
        assert!(!is_newer("0.2.8", "0.2.9"));
        assert!(!is_newer("0.2.9", "0.2.10"));
        assert!(!is_newer("garbage", "0.2.9")); // unparseable -> not newer
    }

    #[test]
    fn sha256_hex_matches_known_vector() {
        // NIST SHA-256("abc")
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
