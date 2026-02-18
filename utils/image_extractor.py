"""
Image extraction utilities for SearchBox.
Handles thumbnail generation from C++ extracted raw images and markdown image extraction.
"""

import os
import io
from PIL import Image
import logging

logger = logging.getLogger(__name__)

class ImageExtractor:
    def __init__(self, base_thumbnail_dir="static/thumbnails"):
        self.base_thumbnail_dir = base_thumbnail_dir
        self.ensure_thumbnail_dir()
    
    def ensure_thumbnail_dir(self):
        """Create thumbnail directory if it doesn't exist."""
        if not os.path.exists(self.base_thumbnail_dir):
            os.makedirs(self.base_thumbnail_dir, exist_ok=True)
    
    def _save_thumbnail(self, image_data, doc_id, index, doc_thumb_dir):
        """Save image data as thumbnail."""
        try:
            # Open image with PIL
            image = Image.open(io.BytesIO(image_data))
            
            # Convert to RGB if necessary (for JPEG compatibility)
            if image.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', image.size, (255, 255, 255))
                if image.mode == 'P':
                    image = image.convert('RGBA')
                background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                image = background
            
            # Generate thumbnails in different sizes
            thumbnail_sizes = {
                'large': (150, 150),    # For search results
                'medium': (300, 300),   # For gallery (better quality)
                'small': (100, 100),    # For fallback
                'modal': (800, 800)     # For modal preview
            }
            
            saved_paths = []
            
            for size_name, size in thumbnail_sizes.items():
                # Create thumbnail
                thumbnail = image.copy()
                thumbnail.thumbnail(size, Image.Resampling.LANCZOS)
                
                # Save as WebP (with fallback to PNG)
                thumbnail_path = os.path.join(
                    doc_thumb_dir, 
                    f"{doc_id}_thumb_{index}_{size_name}.webp"
                )
                
                try:
                    # Try WebP first (better compression)
                    thumbnail.save(thumbnail_path, 'WebP', quality=85, optimize=True)
                except Exception:
                    # Fallback to PNG
                    thumbnail_path = thumbnail_path.replace('.webp', '.png')
                    thumbnail.save(thumbnail_path, 'PNG', optimize=True)
                
                saved_paths.append(thumbnail_path)
            
            # Return the large thumbnail path as primary (with /static/ prefix)
            if saved_paths:
                return saved_paths[0].replace('static/', '/static/')
            return None
            
        except Exception as e:
            logger.error(f"Error saving thumbnail for {doc_id} image {index}: {e}")
            return None
    
    def get_first_thumbnail(self, doc_id):
        """Get the first thumbnail path for a document."""
        doc_thumb_dir = os.path.join(self.base_thumbnail_dir, doc_id)
        
        if not os.path.exists(doc_thumb_dir):
            return None
        
        # Look for large thumbnails first
        for file in os.listdir(doc_thumb_dir):
            if file.endswith('_large.webp') or file.endswith('_large.png') or file.endswith('_large.jpg'):
                return os.path.join(doc_thumb_dir, file).replace('static/', '/static/')
        
        return None
    
    def get_all_thumbnails(self, doc_id):
        """Get all small thumbnails for a document (DOCX images and PDF pages)."""
        thumbnails = []
        doc_thumb_dir = os.path.join(self.base_thumbnail_dir, doc_id)
        
        if not os.path.exists(doc_thumb_dir):
            return thumbnails
        
        # Get small thumbnails for gallery (both DOCX images and PDF pages)
        for file in sorted(os.listdir(doc_thumb_dir)):
            if file.endswith('_small.webp') or file.endswith('_small.png') or file.endswith('_small.jpg'):
                thumbnails.append(os.path.join(doc_thumb_dir, file).replace('static/', '/static/'))
        
        return thumbnails
    
    def extract_images_from_markdown(self, file_path, doc_id):
        """
        Extract absolute path images from markdown file and generate thumbnails.
        
        Args:
            file_path (str): Path to the markdown file
            doc_id (str): Document ID for folder naming
            
        Returns:
            list: List of thumbnail paths and metadata
        """
        images = []
        
        try:
            # Create document-specific thumbnail directory
            doc_thumb_dir = os.path.join(self.base_thumbnail_dir, doc_id)
            os.makedirs(doc_thumb_dir, exist_ok=True)
            
            # Read markdown content
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Find absolute path images: ![alt](/absolute/path/image.jpg)
            import re
            pattern = r'!\[([^\]]*)\]\((/[^)]+)\)'
            matches = re.findall(pattern, content)
            
            logger.info(f"Found {len(matches)} absolute path images in markdown {doc_id}")
            
            for index, (alt_text, image_path) in enumerate(matches):
                try:
                    # Validate image file exists
                    if not os.path.exists(image_path):
                        logger.warning(f"Image file not found: {image_path}")
                        continue
                    
                    # Check if it's a valid image file
                    valid_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
                    if not any(image_path.lower().endswith(ext) for ext in valid_extensions):
                        logger.warning(f"Invalid image format: {image_path}")
                        continue
                    
                    # Save thumbnail using dedicated markdown method
                    thumbnail_path = self._save_markdown_thumbnail(
                        image_path, doc_id, index, doc_thumb_dir, alt_text
                    )
                    
                    if thumbnail_path:
                        images.append({
                            'thumbnail_path': thumbnail_path,
                            'alt_text': alt_text,
                            'original_path': image_path,
                            'index': index
                        })
                        logger.info(f"Extracted markdown image {index + 1}: {alt_text}")
                    
                except Exception as e:
                    logger.warning(f"Error processing markdown image {image_path}: {e}")
                    continue
            
            logger.info(f"Successfully extracted {len(images)} images from markdown {doc_id}")
            
        except Exception as e:
            logger.error(f"Error extracting images from markdown {doc_id}: {e}")
        
        return images

    def _save_markdown_thumbnail(self, image_path, doc_id, index, doc_thumb_dir, alt_text=""):
        """Save markdown image as thumbnail in all sizes."""
        try:
            # Open image with PIL
            image = Image.open(image_path)
            
            # Convert to RGB if necessary (for JPEG compatibility)
            if image.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', image.size, (255, 255, 255))
                if image.mode == 'P':
                    image = image.convert('RGBA')
                background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                image = background
            
            # Generate thumbnails in different sizes
            thumbnail_sizes = {
                'large': (150, 150),    # For search results
                'medium': (300, 300),   # For gallery (better quality)
                'small': (100, 100),    # For fallback
                'modal': (800, 800)     # For modal preview
            }
            
            saved_paths = []
            
            for size_name, size in thumbnail_sizes.items():
                # Create thumbnail
                thumbnail = image.copy()
                thumbnail.thumbnail(size, Image.Resampling.LANCZOS)
                
                # Save as WebP (with fallback to PNG)
                thumbnail_path = os.path.join(
                    doc_thumb_dir, 
                    f"{doc_id}_markdown_{index}_{size_name}.webp"
                )
                
                try:
                    # Try WebP first (better compression)
                    thumbnail.save(thumbnail_path, 'WebP', quality=85, optimize=True)
                except Exception:
                    # Fallback to PNG
                    thumbnail_path = thumbnail_path.replace('.webp', '.png')
                    thumbnail.save(thumbnail_path, 'PNG', optimize=True)
                
                saved_paths.append(thumbnail_path)
            
            # Return the large thumbnail path as primary (with /static/ prefix)
            if saved_paths:
                return saved_paths[0].replace('static/', '/static/')
            return None
            
        except Exception as e:
            logger.error(f"Error saving markdown thumbnail for {doc_id} image {index}: {e}")
            return None

    def generate_thumbnails_from_raw(self, raw_image_paths, doc_id):
        """
        Generate multi-size thumbnails from raw image files extracted by the C++ binary.
        
        Args:
            raw_image_paths (list): List of absolute paths to raw extracted images
            doc_id (str): Document ID for folder naming
            
        Returns:
            list: List of thumbnail metadata dicts
        """
        images = []
        
        try:
            doc_thumb_dir = os.path.join(self.base_thumbnail_dir, doc_id)
            os.makedirs(doc_thumb_dir, exist_ok=True)
            
            for index, raw_path in enumerate(raw_image_paths):
                try:
                    if not os.path.exists(raw_path):
                        logger.warning(f"Raw image not found: {raw_path}")
                        continue
                    
                    with open(raw_path, 'rb') as f:
                        image_data = f.read()
                    
                    if len(image_data) == 0:
                        continue
                    
                    thumbnail_path = self._save_thumbnail(
                        image_data, doc_id, index, doc_thumb_dir
                    )
                    
                    if thumbnail_path:
                        images.append({
                            'thumbnail_path': thumbnail_path,
                            'original_size': len(image_data),
                            'index': index,
                            'type': 'cpp_extracted'
                        })
                        
                except Exception as e:
                    logger.warning(f"Error processing raw image {raw_path} for {doc_id}: {e}")
                    continue
            
            logger.info(f"Generated {len(images)} thumbnails from C++ extracted images for {doc_id}")
            
        except Exception as e:
            logger.error(f"Error generating thumbnails from raw images for {doc_id}: {e}")
        
        return images


# Global instance
image_extractor = ImageExtractor()
