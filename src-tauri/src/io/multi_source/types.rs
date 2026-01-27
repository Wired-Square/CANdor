// io/multi_source/types.rs
//
// Type definitions for multi-source reader sessions.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::io::gvret::BusMapping;
use crate::io::types::TransmitSender;

/// Configuration for a single source in a multi-source session
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SourceConfig {
    /// Profile ID for this source
    pub profile_id: String,
    /// Profile kind (gvret_tcp, gvret_usb, gs_usb, socketcan, slcan, serial)
    pub profile_kind: String,
    /// Display name for this source
    pub display_name: String,
    /// Bus mappings for this source (device bus -> output bus)
    pub bus_mappings: Vec<BusMapping>,
    /// Framing encoding for serial sources (overrides profile settings if provided)
    #[serde(default)]
    pub framing_encoding: Option<String>,
    /// Delimiter bytes for delimiter-based framing
    #[serde(default)]
    pub delimiter: Option<Vec<u8>>,
    /// Maximum frame length for delimiter-based framing
    #[serde(default)]
    pub max_frame_length: Option<usize>,
    /// Minimum frame length - frames shorter than this are discarded
    #[serde(default)]
    pub min_frame_length: Option<usize>,
    /// Whether to emit raw bytes in addition to framed data
    #[serde(default)]
    pub emit_raw_bytes: Option<bool>,
    /// Frame ID extraction: start byte position (0-indexed)
    #[serde(default)]
    pub frame_id_start_byte: Option<i32>,
    /// Frame ID extraction: number of bytes (1 or 2)
    #[serde(default)]
    pub frame_id_bytes: Option<u8>,
    /// Frame ID extraction: byte order (true = big endian)
    #[serde(default)]
    pub frame_id_big_endian: Option<bool>,
    /// Source address extraction: start byte position (0-indexed)
    #[serde(default)]
    pub source_address_start_byte: Option<i32>,
    /// Source address extraction: number of bytes (1 or 2)
    #[serde(default)]
    pub source_address_bytes: Option<u8>,
    /// Source address extraction: byte order (true = big endian)
    #[serde(default)]
    pub source_address_big_endian: Option<bool>,
}

/// Transmit routing info: maps output bus to source and device bus
#[derive(Clone, Debug)]
pub(super) struct TransmitRoute {
    /// Source index in the sources array
    pub source_idx: usize,
    /// Profile ID for logging
    pub profile_id: String,
    /// Profile kind for frame encoding (gvret_tcp, gvret_usb, gs_usb, socketcan, slcan)
    pub profile_kind: String,
    /// Device bus number to use when transmitting
    pub device_bus: u8,
}

/// Shared transmit channels by source index
pub(super) type TransmitChannels = Arc<Mutex<HashMap<usize, TransmitSender>>>;
