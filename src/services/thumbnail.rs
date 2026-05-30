//! JPEG thumbnail generation for images. Backs `/api/thumbnail/{doc_id}`.
//!
//! Fits decoded images into a bounding box (default 256 px), preserves aspect
//! ratio, and writes a JPEG next to `config.thumbnails_dir`. SVG is not
//! supported by the `image` crate's default set and falls through silently —
//! callers should skip SVGs rather than treating the absence as an error.

use std::path::Path;

use anyhow::{Context, Result};
use image::imageops::FilterType;

/// Default max dimension on the longer edge of the generated thumbnail.
pub const DEFAULT_MAX_DIM: u32 = 256;

/// Extensions we know `image` can decode with the features enabled in
/// `Cargo.toml`. Everything else (notably `svg`) is skipped for generation.
pub fn is_supported_ext(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif" | "tiff" | "tif"
    )
}

/// Broader test used to tag Meili docs with `is_image`. Includes formats we
/// can't thumbnail (svg) so they still surface in the image gallery UI —
/// the frontend shows a broken-thumb fallback, matching the old Python
/// behaviour.
pub fn is_image_ext(ext: &str) -> bool {
    is_supported_ext(ext) || ext.eq_ignore_ascii_case("svg")
}

/// Generate a JPEG thumbnail from raw image bytes. Used for uploads that
/// never hit disk unencrypted (vault flow).
pub fn write_from_bytes(bytes: &[u8], dst: &Path, max_dim: u32) -> Result<()> {
    let img = image::load_from_memory(bytes).context("decode image for thumbnail")?;
    encode_jpeg(img, dst, max_dim)
}

/// Generate a JPEG thumbnail from a source image file on disk.
pub fn write_from_path(src: &Path, dst: &Path, max_dim: u32) -> Result<()> {
    let img = image::open(src).with_context(|| format!("open image {}", src.display()))?;
    encode_jpeg(img, dst, max_dim)
}

fn encode_jpeg(img: image::DynamicImage, dst: &Path, max_dim: u32) -> Result<()> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).context("create thumbnails dir")?;
    }
    // Triangle is a decent quality/speed tradeoff for downscales; Nearest is
    // visibly jaggy on photos and Lanczos is overkill at 256 px.
    let small = img.resize(max_dim, max_dim, FilterType::Triangle);
    // Drop the alpha channel because JPEG has none.
    let rgb = small.to_rgb8();
    rgb.save_with_format(dst, image::ImageFormat::Jpeg)
        .with_context(|| format!("write thumbnail {}", dst.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    #[test]
    fn generates_jpeg_from_bytes() {
        // 4×4 red PNG encoded in-memory as our test source.
        let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
            ImageBuffer::from_fn(4, 4, |_, _| Rgb([255, 0, 0]));
        let mut png_bytes: Vec<u8> = Vec::new();
        image::DynamicImage::ImageRgb8(img)
            .write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            )
            .unwrap();

        let dst =
            std::env::temp_dir().join(format!("searchbox-thumb-{}.jpg", uuid::Uuid::new_v4()));
        write_from_bytes(&png_bytes, &dst, 64).unwrap();
        assert!(dst.exists());
        // Minimum JPEG SOI marker (FF D8) proves we wrote a JPEG.
        let out = std::fs::read(&dst).unwrap();
        assert!(out.len() > 2 && out[0] == 0xFF && out[1] == 0xD8);
        let _ = std::fs::remove_file(dst);
    }

    #[test]
    fn unsupported_ext_is_flagged() {
        assert!(!is_supported_ext("svg"));
        assert!(!is_supported_ext("pdf"));
        assert!(is_supported_ext("PNG"));
        assert!(is_supported_ext("jpg"));
    }
}
