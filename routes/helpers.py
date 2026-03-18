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

"""Shared route helpers — eliminates duplicated _get_config / _get_index across blueprints."""

from flask import current_app

from services.config_service import get_searchbox_config
from services.meilisearch_service import get_documents_index


def get_config():
    """Get the current SearchBox configuration dict."""
    return get_searchbox_config(current_app._get_current_object(), current_app.Settings)


def get_index():
    """Get the Meilisearch documents index."""
    return get_documents_index(get_config)
