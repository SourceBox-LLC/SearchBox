"""
Adaptive resource monitor for SearchBox.
Reads /proc/meminfo and /proc/self/status to dynamically adjust
batch sizes and processing rates based on available system resources.
No external dependencies — uses only /proc filesystem (Linux).

When memory is high, images are deferred (not skipped) and processed
later once resources recover.
"""

import os
import time
import logging

logger = logging.getLogger(__name__)


def _read_proc_meminfo():
    """Parse /proc/meminfo and return dict of values in KB."""
    info = {}
    try:
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(':')
                    info[key] = int(parts[1])  # KB
    except (OSError, ValueError):
        pass
    return info


def _read_proc_self_rss_kb():
    """Get current process RSS in KB from /proc/self/status."""
    try:
        with open('/proc/self/status', 'r') as f:
            for line in f:
                if line.startswith('VmRSS:'):
                    return int(line.split()[1])
    except (OSError, ValueError):
        pass
    return 0


def get_memory_usage_pct():
    """Return current system memory usage as a float 0.0–1.0."""
    info = _read_proc_meminfo()
    total = info.get('MemTotal', 0)
    avail = info.get('MemAvailable', 0)
    if total == 0:
        return 0.0
    return 1.0 - (avail / total)


class AdaptiveMonitor:
    """
    Monitors system resources and dynamically adjusts processing parameters.

    When memory exceeds MEMORY_HIGH, images are *deferred* (not skipped).
    The caller should queue deferred images and process them during cooldown
    periods when memory drops below MEMORY_LOW.

    Attributes after check():
        batch_size    — docs per Meilisearch write (10–200)
        defer_images  — True when memory is too high for image processing
        sleep_seconds — backpressure delay between batches
    """

    # Tunable thresholds
    MEMORY_CRITICAL = 0.90   # >90% → emergency cooldown: pause + sleep
    MEMORY_HIGH     = 0.80   # >80% → defer images, reduce batch
    MEMORY_MODERATE = 0.65   # >65% → slight scale down
    MEMORY_LOW      = 0.50   # <50% → scale up, process deferred images

    BATCH_MIN       = 10
    BATCH_DEFAULT   = 50
    BATCH_MAX       = 400

    COOLDOWN_SLEEP  = 2.0    # seconds to sleep during critical cooldown
    CHECK_INTERVAL  = 50     # re-check resources every N articles

    def __init__(self):
        self.batch_size = self.BATCH_DEFAULT
        self.defer_images = False
        self.sleep_seconds = 0.0
        self._check_counter = 0
        self._cpu_count = os.cpu_count() or 4
        self._total_mem_kb = self._get_total_mem()
        self._adjustments = 0
        self._cooldowns = 0
        self._last_usage_pct = 0.0

        logger.info(f"AdaptiveMonitor init: {self._total_mem_kb // 1024} MB total RAM, "
                    f"{self._cpu_count} CPUs, batch_size={self.batch_size}")

    def _get_total_mem(self):
        info = _read_proc_meminfo()
        return info.get('MemTotal', 8 * 1024 * 1024)  # default 8GB

    def check(self):
        """
        Call periodically. Returns self for chained attribute access.
        Only actually reads /proc every CHECK_INTERVAL calls.
        """
        self._check_counter += 1
        if self._check_counter % self.CHECK_INTERVAL != 0:
            return self

        self._adjust()
        return self

    def _adjust(self):
        """Read system state and adjust parameters."""
        mem_info = _read_proc_meminfo()
        available_kb = mem_info.get('MemAvailable', 0)
        total_kb = mem_info.get('MemTotal', self._total_mem_kb)

        if total_kb == 0:
            return

        usage_pct = 1.0 - (available_kb / total_kb)
        self._last_usage_pct = usage_pct
        process_rss_mb = _read_proc_self_rss_kb() / 1024

        # Load average (1-min)
        try:
            load_1 = os.getloadavg()[0]
        except OSError:
            load_1 = 0.0

        load_ratio = load_1 / self._cpu_count if self._cpu_count else 1.0

        prev_batch = self.batch_size
        prev_defer = self.defer_images
        prev_sleep = self.sleep_seconds

        # --- Memory-based adjustments ---
        if usage_pct >= self.MEMORY_CRITICAL:
            # Emergency: minimum batch, defer images, active cooldown
            self.batch_size = self.BATCH_MIN
            self.defer_images = True
            self.sleep_seconds = self.COOLDOWN_SLEEP
            self._cooldowns += 1
        elif usage_pct >= self.MEMORY_HIGH:
            # High pressure: defer images, reduce batch, small sleep
            self.batch_size = max(self.BATCH_MIN, self.batch_size * 2 // 3)
            self.defer_images = True
            self.sleep_seconds = 0.2
        elif usage_pct >= self.MEMORY_MODERATE:
            # Moderate: keep processing images, slight scale down
            self.batch_size = max(self.BATCH_MIN, self.batch_size - 5)
            self.defer_images = False
            self.sleep_seconds = 0.05
        elif usage_pct < self.MEMORY_LOW:
            # Plenty of room: scale up, process everything
            self.batch_size = min(self.BATCH_MAX, self.batch_size + 10)
            self.defer_images = False
            self.sleep_seconds = 0.0

        # --- CPU load adjustment (additive) ---
        if load_ratio > 2.0:
            self.sleep_seconds = max(self.sleep_seconds, 0.3)
            self.batch_size = max(self.BATCH_MIN, self.batch_size // 2)
        elif load_ratio > 1.5:
            self.sleep_seconds = max(self.sleep_seconds, 0.1)

        # Log if anything changed
        if (self.batch_size != prev_batch or
                self.defer_images != prev_defer or
                self.sleep_seconds != prev_sleep):
            self._adjustments += 1
            logger.info(
                f"AdaptiveMonitor adjust #{self._adjustments}: "
                f"mem={usage_pct:.0%} rss={process_rss_mb:.0f}MB "
                f"load={load_1:.1f}/{self._cpu_count} → "
                f"batch={self.batch_size} defer_img={self.defer_images} "
                f"sleep={self.sleep_seconds:.2f}s"
            )

    def is_safe_for_deferred(self):
        """Check if resources are low enough to process deferred images.
        Can be called frequently — just reads the last cached usage."""
        return self._last_usage_pct < self.MEMORY_MODERATE

    def wait_for_cooldown(self, max_wait=30):
        """Block until memory drops below MEMORY_HIGH or max_wait seconds.
        Returns True if memory recovered, False if timed out."""
        start = time.monotonic()
        while time.monotonic() - start < max_wait:
            usage = get_memory_usage_pct()
            if usage < self.MEMORY_HIGH:
                logger.info(f"AdaptiveMonitor cooldown complete: mem={usage:.0%}")
                return True
            time.sleep(1.0)
        logger.warning(f"AdaptiveMonitor cooldown timed out after {max_wait}s")
        return False

    def summary(self):
        """Return a summary string for final logging."""
        return (f"AdaptiveMonitor: {self._adjustments} adjustments, "
                f"{self._cooldowns} cooldowns, "
                f"final batch_size={self.batch_size}")
