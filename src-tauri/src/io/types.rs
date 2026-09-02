// ui/src-tauri/src/io/source_types.rs
//
// Shared types for multi-source streaming.
// Used by interface implementations to communicate with the merge task.

use std::sync::mpsc as std_mpsc;

use super::FrameMessage;

// ============================================================================
// Source Messages
// ============================================================================

/// Timestamped byte entry for raw byte streams (serial, SPI, etc.)
#[derive(Clone, Debug)]
pub struct ByteEntry {
    pub byte: u8,
    pub timestamp_us: u64,
    /// Bus/interface number (from bus mapping)
    pub bus: u8,
}

/// Internal message from sub-readers to the merge task
pub enum SourceMessage {
    /// Frames from a source (source_index, frames)
    Frames(usize, Vec<FrameMessage>),
    /// Raw bytes from a source (source_index, bytes with timestamps)
    /// Only constructed by serial reader which is not available on iOS
    #[cfg_attr(target_os = "ios", allow(dead_code))]
    Bytes(usize, Vec<ByteEntry>),
    /// Source ended (source_index, reason)
    Ended(usize, String),
    /// Source error (source_index, error)
    Error(usize, String),
    /// Transmit channel is ready (source_index, transmit_sender)
    TransmitReady(usize, TransmitSender),
    /// Control channel is ready (source_index, control_sender) — serial only,
    /// for live framing changes.
    #[cfg_attr(target_os = "ios", allow(dead_code))]
    ControlReady(usize, ControlSender),
    /// Source connected successfully (source_index, device_type, address, bus_number)
    Connected(usize, String, String, Option<u8>),
    /// A source has reconciled its bus mappings against the connected device
    /// (source_index, mappings).
    ///
    /// The mappings a session starts with are built from the profile before any
    /// connection exists, so they can be wrong in both directions: a bus the
    /// device does not have, or — the expensive one — a bus it does have that
    /// nothing is listening to. A driver that can enumerate its interfaces sends
    /// this once connected; the broker adopts it for `available_buses` and
    /// transmit routing so receive and transmit agree on the same set.
    MappingsResolved(usize, Vec<crate::io::gvret::BusMapping>),
}

// ============================================================================
// Transmit Types
// ============================================================================

/// Transmit request sent through the channel
pub struct TransmitRequest {
    /// Encoded frame bytes ready to send
    pub data: Vec<u8>,
    /// Sync oneshot channel to send the result back
    pub result_tx: std_mpsc::SyncSender<Result<(), String>>,
}

/// Sender type for transmit requests (sync-safe)
pub type TransmitSender = std_mpsc::SyncSender<TransmitRequest>;

// ============================================================================
// Control Types (live framing changes)
// ============================================================================

/// A live framing change for a running serial source. Carries primitives only
/// (no serial-only types) so the shared broker can hold/dispatch it on every
/// platform; the serial reader rebuilds the `FramingEncoding`/`FrameIdConfig`.
#[derive(Clone, Debug)]
pub struct SetFramingRequest {
    /// `slip` | `modbus_rtu` | `delimiter` | `raw` | … (anything not a real
    /// framer resolves to raw, matching `parse_profile_for_source`).
    pub encoding: String,
    pub frame_id_start_byte: Option<i32>,
    pub frame_id_bytes: Option<u8>,
    pub frame_id_big_endian: bool,
    pub source_address_start_byte: Option<i32>,
    pub source_address_bytes: Option<u8>,
    pub source_address_big_endian: bool,
    pub min_frame_length: usize,
    pub emit_raw_bytes: bool,
}

/// Sender type for control requests (sync-safe), mirroring `TransmitSender`.
pub type ControlSender = std_mpsc::SyncSender<SetFramingRequest>;

