// ui/src-tauri/src/checksum_discovery.rs
//
// The Tauri command surface for checksum discovery. The scan itself —
// grouping, sampling, identification, sweep, solve, ranking — lives in
// `wiretap_analysis::scan`, because all of it is a pure function of payloads
// and because the other consumers (the MCP scan, and a catalogue validator
// asking "does this declared checksum hold?") cannot reach into an app binary.

use serde::Deserialize;

use wiretap_analysis::{scan_frames, ChecksumScanOptions, ChecksumScanResult, FrameKey};

/// Just enough of a `FrameMessage` to group and analyse. Serde ignores the rest
/// of the fields the frontend sends.
#[derive(Debug, Clone, Deserialize)]
pub struct DiscoveryFrame {
    pub frame_id: u32,
    pub bytes: Vec<u8>,
    #[serde(default)]
    pub is_extended: bool,
}

/// Scan a capture for checksums, one call for the whole run.
#[tauri::command]
pub fn discover_checksums_cmd(
    frames: Vec<DiscoveryFrame>,
    options: Option<ChecksumScanOptions>,
) -> ChecksumScanResult {
    scan_frames(
        frames
            .into_iter()
            .map(|f| (FrameKey::new(f.frame_id, f.is_extended), f.bytes)),
        &options.unwrap_or_default(),
    )
}
