"""
qBittorrent Web API client for SearchBox.
Handles authentication, torrent listing, and status checks.
"""

import logging

import requests

logger = logging.getLogger(__name__)


class QBittorrentClient:
    """Client for the qBittorrent Web API (v2)."""

    def __init__(self, host='http://localhost', port=8080, username='admin', password=''):
        self.base_url = f'{host}:{port}'
        self.username = username
        self.password = password
        self._session = requests.Session()
        self._authenticated = False

    def login(self):
        """Authenticate with qBittorrent. Returns True on success."""
        try:
            resp = self._session.post(
                f'{self.base_url}/api/v2/auth/login',
                data={'username': self.username, 'password': self.password},
                timeout=10
            )
            if resp.status_code == 200 and resp.text == 'Ok.':
                self._authenticated = True
                return True
            logger.warning(f'qBittorrent login failed: {resp.status_code} {resp.text}')
            self._authenticated = False
            return False
        except requests.RequestException as e:
            logger.error(f'qBittorrent connection error: {e}')
            self._authenticated = False
            return False

    def _ensure_auth(self):
        """Login if not already authenticated."""
        if not self._authenticated:
            if not self.login():
                raise ConnectionError('Failed to authenticate with qBittorrent')

    def get_version(self):
        """Get qBittorrent application version."""
        self._ensure_auth()
        resp = self._session.get(f'{self.base_url}/api/v2/app/version', timeout=10)
        resp.raise_for_status()
        return resp.text.strip()

    def get_transfer_info(self):
        """Get global transfer info (speeds, etc)."""
        self._ensure_auth()
        resp = self._session.get(f'{self.base_url}/api/v2/transfer/info', timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_torrents(self, filter_status=None):
        """Get list of torrents, optionally filtered by status.

        filter_status: 'all', 'downloading', 'seeding', 'completed', 'paused',
                       'active', 'inactive', 'resumed', 'stalled', 'errored'
        """
        self._ensure_auth()
        params = {}
        if filter_status:
            params['filter'] = filter_status
        resp = self._session.get(
            f'{self.base_url}/api/v2/torrents/info',
            params=params,
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()

    def get_completed_torrents(self):
        """Get list of completed torrents."""
        return self.get_torrents(filter_status='completed')

    def get_active_torrents(self):
        """Get list of active (downloading/uploading) torrents."""
        return self.get_torrents(filter_status='active')

    def get_torrent_files(self, torrent_hash):
        """Get the file list for a specific torrent."""
        self._ensure_auth()
        resp = self._session.get(
            f'{self.base_url}/api/v2/torrents/files',
            params={'hash': torrent_hash},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()

    def get_status(self):
        """Get connection status summary. Returns dict with version, speeds, counts."""
        try:
            version = self.get_version()
            transfer = self.get_transfer_info()
            torrents = self.get_torrents(filter_status='all')

            downloading = sum(1 for t in torrents if t.get('state', '').startswith('download'))
            completed = sum(1 for t in torrents if t.get('progress', 0) >= 1.0)

            return {
                'connected': True,
                'version': version,
                'dl_speed': transfer.get('dl_info_speed', 0),
                'up_speed': transfer.get('up_info_speed', 0),
                'downloading_count': downloading,
                'completed_count': completed,
                'total_count': len(torrents),
            }
        except Exception as e:
            logger.error(f'qBittorrent status check failed: {e}')
            return {
                'connected': False,
                'error': str(e),
            }


def create_client(config):
    """Create a QBittorrentClient from app config dict."""
    return QBittorrentClient(
        host=config.get('qbt_host', 'http://localhost'),
        port=int(config.get('qbt_port', 8080)),
        username=config.get('qbt_username', 'admin'),
        password=config.get('qbt_password', ''),
    )
