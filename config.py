"""
Centralized configuration and constants for SearchBox.
"""

import os

BASE_DIR = os.path.dirname(__file__)

# File system paths
VAULT_FOLDER = os.path.join(BASE_DIR, 'vault')
MEILI_DATA_DIR = os.path.join(BASE_DIR, 'meili_data')

# Meilisearch
INDEX_NAME = 'documents'

# Allowed file types
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'docx', 'doc', 'md', 'xlsx', 'html', 'htm', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'}
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'}

# Ensure directories exist
os.makedirs(VAULT_FOLDER, exist_ok=True)
os.makedirs(MEILI_DATA_DIR, exist_ok=True)
