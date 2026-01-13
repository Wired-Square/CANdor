// ui/src-tauri/src/profile_tracker.rs
//
// Profile usage tracker for IO sessions.
// Tracks which sessions are using which profiles to prevent conflicts
// on single-handle devices (slcan, serial).

use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;

/// Information about active profile usage
#[derive(Clone, Debug, Serialize)]
pub struct ProfileUsage {
    /// ID of the session using this profile
    pub session_id: String,
}

/// Map of profile_id -> active usage
static PROFILE_USAGE: Lazy<Mutex<HashMap<String, ProfileUsage>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Register a profile as being used by a session
pub fn register_usage(profile_id: &str, session_id: &str) {
    if let Ok(mut map) = PROFILE_USAGE.lock() {
        map.insert(
            profile_id.to_string(),
            ProfileUsage {
                session_id: session_id.to_string(),
            },
        );
        eprintln!(
            "[profile_tracker] Registered usage for profile '{}' by session '{}'",
            profile_id, session_id
        );
    }
}

/// Unregister profile usage when a session ends
pub fn unregister_usage(profile_id: &str) {
    if let Ok(mut map) = PROFILE_USAGE.lock() {
        if map.remove(profile_id).is_some() {
            eprintln!(
                "[profile_tracker] Unregistered usage for profile '{}'",
                profile_id
            );
        }
    }
}

/// Check if a profile is in use, and by what type of session
pub fn get_usage(profile_id: &str) -> Option<ProfileUsage> {
    PROFILE_USAGE.lock().ok()?.get(profile_id).cloned()
}

/// Profile kinds that require exclusive (single-handle) access
const SINGLE_HANDLE_KINDS: &[&str] = &["slcan", "serial"];

/// Check if a profile can be used (not already in use by another session)
///
/// For single-handle devices (slcan, serial), only one session is allowed.
/// For multi-handle devices (gvret_tcp, postgres, etc.), multiple sessions are OK.
///
/// Returns Ok(()) if the profile can be used, or an error message if it's in use.
pub fn can_use_profile(profile_id: &str, profile_kind: &str) -> Result<(), String> {
    // Multi-handle profiles can always be used by multiple sessions
    if !SINGLE_HANDLE_KINDS.contains(&profile_kind) {
        return Ok(());
    }

    // Check if this single-handle profile is already in use
    if let Some(usage) = get_usage(profile_id) {
        Err(format!(
            "Profile is in use by session '{}'. Stop that session first.",
            usage.session_id
        ))
    } else {
        Ok(())
    }
}

/// Check if a profile kind requires single-handle access
#[allow(dead_code)]
pub fn is_single_handle_kind(profile_kind: &str) -> bool {
    SINGLE_HANDLE_KINDS.contains(&profile_kind)
}
