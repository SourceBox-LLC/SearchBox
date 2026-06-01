# Building SearchBox

## From source (any platform)

Requires Rust stable (1.84+).

```bash
cargo build --release
# → target/release/searchbox       (Linux/macOS)
# → target\release\searchbox.exe   (Windows)
```

The binary is fully self-contained — templates and static assets are
baked in via `rust-embed`. Meilisearch is still required at runtime; the
app auto-detects a `meilisearch(.exe)` binary sitting next to
`searchbox(.exe)`, or you can point at one from the Settings page.

## Docker image

```bash
docker build -t sourcebox/searchbox:latest .
docker compose up -d        # or the one-shot `docker run` in README
```

The build uses a two-stage layout: `rust:1.88-slim-bookworm` to compile,
`debian:bookworm-slim` to run. Meilisearch is installed from the
official APT repo into the runtime stage. The runtime image contains
only the binary + Meilisearch — no sibling `templates/` or `static/`
dirs, since they're embedded.

## Windows MSI installer

> **For end users:** don't build anything — download the latest
> `SearchBox-<version>-x86_64.msi` from [Releases](https://github.com/SourceBox-LLC/SearchBox/releases)
> and double-click. This section is for maintainers cutting a release.

### Releasing (the normal path)

Tag a version and push — GitHub Actions builds the MSI on a Windows
runner and attaches it to the Release automatically:

```bash
git tag v1.2.3
git push origin v1.2.3
```

Watch the `release` workflow in the Actions tab. On success, the tagged
release page shows `SearchBox-1.2.3-x86_64.msi` ready to download. That's
the file end users get — no scripts, no toolchains, no PowerShell.

The pipeline is defined in `.github/workflows/release.yml`. It checks
out the repo, installs Rust + cargo-wix, runs `wix\build.ps1` (same
script local dev uses), uploads the MSI as a workflow artifact, and
attaches it to the Release for tag builds.

### Publishing to winget (optional)

Once a release is on the Releases page, `.github/workflows/winget.yml` can
submit it to the [Windows Package Manager](https://github.com/microsoft/winget-pkgs)
so users get `winget install SourceBox.SearchBox` and `winget upgrade`.
winget accepts unsigned MSIs, and a single manifest carries both the x64
and ARM64 installers (the architecture is read from each MSI).

**One-time setup (maintainer):**

1. Create a **classic** Personal Access Token (not fine-grained) with the
   `public_repo` scope and add it as the repo secret `WINGET_TOKEN`.
2. Fork `microsoft/winget-pkgs` into the account/org that token can push to
   (defaults to `SourceBox-LLC`; otherwise set `fork-user` in the workflow).

**Submitting:**

- New releases trigger the workflow automatically (on `release: released`).
- For the first / back-fill submission, run the **winget** workflow manually
  (Actions → winget → Run workflow) and pass an existing tag, e.g. `v0.3.0`.

The first submission creates a new package, so expect a one-time moderator
review on the winget-pkgs PR. The `identifier` (`SourceBox.SearchBox`) is
permanent — change it in the workflow before the first run if you want a
different name. Heads-up: winget is a second update channel alongside the
app's built-in update check; the simplest convention is to keep in-app
update primary and tell winget users to `winget upgrade`.

### Building the MSI locally

Only needed when you want to test installer changes without cutting a
real release. The `wix\build.ps1` script drives the whole pipeline:
download the Meilisearch sidecar, convert `LICENSE` → `wix\License.rtf`,
build the release binary, then invoke `cargo wix` to package the MSI.

### Prerequisites

Run **once** on the build machine:

1. **Rust** (x86_64-pc-windows-msvc toolchain)
   — https://rustup.rs

2. **WiX Toolset v3.11+**
   — https://github.com/wixtoolset/wix3/releases
   Install and confirm `candle.exe` and `light.exe` are on `PATH`.

3. **cargo-wix**
   ```powershell
   cargo install cargo-wix
   ```

### Build

From the repo root in PowerShell:

```powershell
.\wix\build.ps1
```

The script exits with the absolute path of the produced `.msi` under
`target\wix\SearchBox-<version>-x86_64.msi`. Double-click to install
(or hand it to users in Releases).

### What the MSI does on install

| | |
|---|---|
| Install dir | `C:\Program Files\SourceBox\SearchBox\` (configurable in the wizard) |
| Payload | `searchbox.exe`, `meilisearch.exe`, `LICENSE.txt` |
| Start Menu | `SearchBox\SearchBox` → launches `searchbox.exe` |
| Uninstall | Registered in Add/Remove Programs under "SearchBox" |
| Runtime data | `%LocalAppData%\SearchBox\` (per-user; **not** under ProgramFiles) |

The app doesn't register a Windows Service — it runs as a user-level
process. Autostart-on-login isn't enabled by default; users who want it
can drop a shortcut into `%AppData%\Microsoft\Windows\Start Menu\Programs\Startup`.

### Signing

An unsigned MSI shows the "unrecognized publisher" SmartScreen warning
on first install. The release workflow signs automatically **when the
following secrets are present** in the repo settings (Settings → Secrets
and variables → Actions); if they're not set, the workflow still
produces a working unsigned MSI without failing.

| Secret | Contents |
|---|---|
| `WINDOWS_CERT_BASE64` | Your `.pfx` certificate, base64-encoded: `certutil -encode cert.pfx cert.b64` (strip header/footer lines, or just pass `[Convert]::ToBase64String([IO.File]::ReadAllBytes('cert.pfx'))` through PowerShell). |
| `WINDOWS_CERT_PASSWORD` | The password used when exporting the `.pfx`. |

The workflow signs `searchbox.exe` first (so the installed binary
carries the signature — not just the MSI wrapper) and then signs the
MSI itself. Both use `signtool` with `/tr http://timestamp.digicert.com`
so signatures remain valid after the certificate expires.

**Manual signing during local iteration:**

```powershell
# After build.ps1 finishes:
& "${env:ProgramFiles(x86)}\Windows Kits\10\bin\<sdk-ver>\x64\signtool.exe" sign `
  /f cert.pfx /p <password> `
  /tr http://timestamp.digicert.com /td sha256 /fd sha256 `
  target\wix\SearchBox-*.msi
```

Certs typically run $100-400/year (Sectigo OV, DigiCert EV). EV certs
skip SmartScreen reputation building but require a hardware token.

### Bumping the bundled Meilisearch version

Edit `$MeiliVersion` at the top of `wix\build.ps1`. The next build will
re-download. Always smoke-test against a new Meilisearch release before
shipping — the REST shape and filter syntax occasionally change.

### Known limitations

- **Requires WebView2.** The desktop window renders via Microsoft WebView2,
  which ships with Windows 11 and current Windows 10. On older or freshly
  imaged Windows 10 the runtime may be absent, and the MSI does not yet bundle
  the WebView2 bootstrapper — so the window can fail to open. Bundling the
  Evergreen WebView2 runtime in `wix\` is a pending follow-up.
- **No Service install.** Making SearchBox a Windows Service needs a
  `windows-service` crate integration; see `src/main.rs` if you want to
  add one.
- **Unsigned.** Users see a SmartScreen warning on first install. The
  fix is a code-signing cert — see the signing section above. CI
  deliberately doesn't sign; add the cert + `signtool` call as a
  separate workflow step once you have the cert in GitHub Secrets.
