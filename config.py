# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 SourceBox LLC
#
# This file is part of SearchBox.
# SearchBox is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# SearchBox is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with SearchBox. If not, see <https://www.gnu.org/licenses/>.

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
