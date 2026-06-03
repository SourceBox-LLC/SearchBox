//! In-memory login throttle — a brute-force speed bump for the password login.
//!
//! Keyed by the (lowercased) email being attempted, so a burst of failures
//! against an account locks just that account's logins for a cooldown that grows
//! with repeated failures, and a successful login clears it. State lives only in
//! process memory (no DB, no disk); it resets on restart, which is fine — the
//! point is to slow an *online* guessing attack, not to be durable.
//!
//! The app binds loopback by default (single user), so in the common case this
//! is a backstop; in `SEARCHBOX_HOST=0.0.0.0` mode it's the front-line defense
//! for the now network-reachable login.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Consecutive failures before an account's logins are locked.
const FAIL_THRESHOLD: u32 = 5;
/// Lockout applied at the threshold; doubles with each further failure, capped.
const BASE_LOCKOUT: Duration = Duration::from_secs(30);
const MAX_LOCKOUT: Duration = Duration::from_secs(15 * 60);
/// A failure streak older than this is forgotten, so a slow trickle of typos
/// never accumulates into a lockout.
const FAIL_WINDOW: Duration = Duration::from_secs(15 * 60);

struct Attempt {
    fails: u32,
    last: Instant,
    locked_until: Option<Instant>,
}

/// Tracks recent failed login attempts per account.
#[derive(Default)]
pub struct LoginThrottle {
    inner: Mutex<HashMap<String, Attempt>>,
}

impl LoginThrottle {
    /// If `key` is currently locked out, return how long remains.
    pub fn check(&self, key: &str) -> Option<Duration> {
        let now = Instant::now();
        let map = self.inner.lock().unwrap();
        let a = map.get(&key.to_ascii_lowercase())?;
        match a.locked_until {
            Some(until) if until > now => Some(until - now),
            _ => None,
        }
    }

    /// Record a failed attempt; lock `key` once failures cross the threshold.
    pub fn record_failure(&self, key: &str) {
        let now = Instant::now();
        let mut map = self.inner.lock().unwrap();
        let a = map.entry(key.to_ascii_lowercase()).or_insert(Attempt {
            fails: 0,
            last: now,
            locked_until: None,
        });
        if now.duration_since(a.last) > FAIL_WINDOW {
            a.fails = 0;
        }
        a.fails = a.fails.saturating_add(1);
        a.last = now;
        if a.fails >= FAIL_THRESHOLD {
            let over = (a.fails - FAIL_THRESHOLD).min(5);
            let lockout = BASE_LOCKOUT
                .checked_mul(1u32 << over)
                .unwrap_or(MAX_LOCKOUT)
                .min(MAX_LOCKOUT);
            a.locked_until = Some(now + lockout);
        }
    }

    /// Clear all state for `key` after a successful authentication.
    pub fn record_success(&self, key: &str) {
        let mut map = self.inner.lock().unwrap();
        map.remove(&key.to_ascii_lowercase());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locks_after_threshold_and_clears_on_success() {
        let t = LoginThrottle::default();
        assert!(t.check("a@b.com").is_none(), "fresh key is not locked");
        for _ in 0..FAIL_THRESHOLD {
            t.record_failure("A@B.com"); // case-insensitive
        }
        assert!(
            t.check("a@b.com").is_some(),
            "locked once failures hit the threshold"
        );
        t.record_success("a@b.com");
        assert!(t.check("a@b.com").is_none(), "a success clears the lock");
    }

    #[test]
    fn under_threshold_is_not_locked() {
        let t = LoginThrottle::default();
        for _ in 0..(FAIL_THRESHOLD - 1) {
            t.record_failure("x@y.com");
        }
        assert!(t.check("x@y.com").is_none(), "below threshold stays open");
    }
}
