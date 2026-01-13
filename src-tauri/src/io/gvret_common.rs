// ui/src-tauri/src/io/gvret_common.rs
//
// Shared GVRET protocol utilities for TCP and USB readers.
//
// Protocol reference: https://github.com/collin80/GVRET
//
// Frame format (receiving):
//   [0xF1][0x00][Timestamp-4bytes-LE][FrameID-4bytes-LE][Bus+DLC-1byte][Data...]
//
// Frame format (transmitting):
//   [0xF1][0x00][FrameID-4bytes-LE][Bus-1byte][Length-1byte][Data...]
//
// Frame ID encoding:
//   - Standard (11-bit): Lower 11 bits, bit 31 = 0
//   - Extended (29-bit): Lower 29 bits, bit 31 = 1 (0x80000000)

use hex::ToHex;
use tauri::AppHandle;

use super::{now_us, CanTransmitFrame, FrameMessage, IOCapabilities, StreamEndedPayload, TransmitResult, emit_to_session};
use crate::buffer_store::{self, BufferType};

// ============================================================================
// Constants
// ============================================================================

/// Extended frame flag (bit 31 of frame ID)
pub const CAN_EFF_FLAG: u32 = 0x8000_0000;
/// Mask for standard (11-bit) CAN ID
pub const CAN_SFF_MASK: u32 = 0x0000_07FF;
/// Mask for extended (29-bit) CAN ID
pub const CAN_EFF_MASK: u32 = 0x1FFF_FFFF;

/// GVRET sync byte
pub const GVRET_SYNC: u8 = 0xF1;
/// GVRET command: CAN frame data
pub const GVRET_CMD_FRAME: u8 = 0x00;
/// Binary mode enable bytes
pub const BINARY_MODE_ENABLE: [u8; 2] = [0xE7, 0xE7];
/// Device info probe command
pub const DEVICE_INFO_PROBE: [u8; 2] = [0xF1, 0x07];

/// DLC to payload length mapping (CAN FD DLC codes)
pub const DLC_LEN: [usize; 16] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];

// ============================================================================
// Capabilities
// ============================================================================

/// Get the IOCapabilities for GVRET devices (shared by TCP and USB)
pub fn gvret_capabilities() -> IOCapabilities {
    IOCapabilities {
        can_pause: false,           // Live stream, would lose data
        supports_time_range: false,
        is_realtime: true,
        supports_speed_control: false,
        supports_seek: false,
        can_transmit: true,         // GVRET supports transmission
        can_transmit_serial: false,
        supports_canfd: true,       // GVRET supports CAN FD
        supports_extended_id: true, // GVRET supports extended IDs
        supports_rtr: true,         // GVRET supports RTR frames
        available_buses: vec![0, 1, 2, 3, 4], // GVRET supports multiple buses
    }
}

// ============================================================================
// Frame Parsing
// ============================================================================

/// Parse GVRET binary frames from a buffer
///
/// Returns a list of (FrameMessage, raw_hex_string) tuples.
/// Consumes parsed bytes from the buffer.
pub fn parse_gvret_frames(buffer: &mut Vec<u8>) -> Vec<(FrameMessage, String)> {
    let mut out = Vec::new();

    loop {
        // Find sync byte 0xF1
        let pos = match buffer.iter().position(|b| *b == GVRET_SYNC) {
            Some(i) => i,
            None => {
                // Keep buffer bounded if sync is lost
                if buffer.len() > 1024 {
                    buffer.clear();
                }
                break;
            }
        };

        // Discard bytes before sync
        if pos > 0 {
            buffer.drain(0..pos);
        }

        // Need at least 2 bytes to check opcode
        if buffer.len() < 2 {
            break;
        }

        let op = buffer[1];

        // Control replies we ignore/skip
        let ctrl_len = match op {
            0x01 => Some(6),  // TIMEBASE: F1 01 <4>
            0x09 => Some(4),  // KEEPALIVE: F1 09 <2>
            0x06 => Some(12), // CANPARAMS: F1 06 <10>
            0x07 => Some(7),  // DEVINFO: F1 07 <5>
            0x0C => Some(3),  // NUMBUSES: F1 0C <1>
            _ => None,
        };

        if let Some(len) = ctrl_len {
            if buffer.len() < len {
                break;
            }
            buffer.drain(0..len);
            continue;
        }

        // Not a frame command - resync
        if op != GVRET_CMD_FRAME {
            buffer.drain(0..1);
            continue;
        }

        // Frame: F1 00 <ts:4 LE> <id:4 LE> <bus_dlc:1> <data:dlc>
        const HEADER_LEN: usize = 2 + 4 + 4 + 1;
        if buffer.len() < HEADER_LEN {
            break;
        }

        let bus_dlc = buffer[10];
        let dlc_nibble = (bus_dlc & 0x0F) as usize;
        if dlc_nibble > 0x0F {
            buffer.drain(0..1);
            continue;
        }

        let payload_len = DLC_LEN[dlc_nibble];
        let total_len = HEADER_LEN + payload_len;

        if buffer.len() < total_len {
            break;
        }

        // Parse frame ID (little-endian)
        let can_id = u32::from_le_bytes(buffer[6..10].try_into().unwrap_or([0; 4]));
        let data = if payload_len > 0 {
            buffer[11..11 + payload_len].to_vec()
        } else {
            Vec::new()
        };

        let is_ext = (can_id & CAN_EFF_FLAG) != 0;
        let arb_id = can_id & if is_ext { CAN_EFF_MASK } else { CAN_SFF_MASK };
        let is_fd = payload_len > 8;
        let bus = (bus_dlc >> 4) & 0x0F;

        // Raw hex for debugging
        let frame_bytes = buffer[..total_len].to_vec().encode_hex::<String>();

        // Use host UNIX time in microseconds
        let ts_us = now_us();

        out.push((
            FrameMessage {
                protocol: "can".to_string(),
                timestamp_us: ts_us,
                frame_id: arb_id,
                bus,
                dlc: payload_len as u8,
                bytes: data,
                is_extended: is_ext,
                is_fd,
                source_address: None,
                incomplete: None,
                direction: None, // Received frames don't have direction set
            },
            frame_bytes,
        ));

        buffer.drain(0..total_len);
    }

    out
}

// ============================================================================
// Frame Encoding
// ============================================================================

/// Encode a CAN frame to GVRET binary format for transmission
///
/// Format: [0xF1][0x00][FrameID-4bytes-LE][Bus-1byte][Length-1byte][Data...]
pub fn encode_gvret_frame(frame: &CanTransmitFrame) -> Vec<u8> {
    let mut buf = Vec::with_capacity(8 + frame.data.len());

    // Sync byte and command
    buf.push(GVRET_SYNC);
    buf.push(GVRET_CMD_FRAME);

    // Frame ID (4 bytes, little-endian)
    // Set bit 31 for extended ID
    let frame_id = if frame.is_extended {
        frame.frame_id | CAN_EFF_FLAG
    } else {
        frame.frame_id & CAN_SFF_MASK // Mask to 11 bits for standard
    };
    buf.extend_from_slice(&frame_id.to_le_bytes());

    // Bus number
    buf.push(frame.bus);

    // Data length
    buf.push(frame.data.len() as u8);

    // Data bytes
    buf.extend_from_slice(&frame.data);

    buf
}

// ============================================================================
// Frame Validation
// ============================================================================

/// Validate a CAN frame for GVRET transmission
///
/// Returns Ok(()) if valid, or an error TransmitResult if invalid.
pub fn validate_gvret_frame(frame: &CanTransmitFrame) -> Result<(), TransmitResult> {
    // Validate data length
    if !frame.is_fd && frame.data.len() > 8 {
        return Err(TransmitResult::error(format!(
            "Classic CAN frame data too long: {} bytes (max 8)",
            frame.data.len()
        )));
    }

    if frame.is_fd && frame.data.len() > 64 {
        return Err(TransmitResult::error(format!(
            "CAN FD frame data too long: {} bytes (max 64)",
            frame.data.len()
        )));
    }

    // Validate bus number (GVRET supports buses 0-4)
    if frame.bus > 4 {
        return Err(TransmitResult::error(format!(
            "Invalid bus number: {} (valid: 0-4)",
            frame.bus
        )));
    }

    Ok(())
}

// ============================================================================
// Stream Helpers
// ============================================================================

/// Emit stream-ended event with buffer info
///
/// Finalizes the buffer and emits the stream-ended event with metadata.
pub fn emit_stream_ended(
    app_handle: &AppHandle,
    session_id: &str,
    reason: &str,
    log_prefix: &str,
) {
    // Finalize the buffer and get metadata
    let metadata = buffer_store::finalize_buffer();

    let (buffer_id, buffer_type, count, time_range, buffer_available) = match metadata {
        Some(ref m) => {
            let type_str = match m.buffer_type {
                BufferType::Frames => "frames",
                BufferType::Bytes => "bytes",
            };
            (
                Some(m.id.clone()),
                Some(type_str.to_string()),
                m.count,
                match (m.start_time_us, m.end_time_us) {
                    (Some(start), Some(end)) => Some((start, end)),
                    _ => None,
                },
                m.count > 0,
            )
        }
        None => (None, None, 0, None, false),
    };

    emit_to_session(
        app_handle,
        "stream-ended",
        session_id,
        StreamEndedPayload {
            reason: reason.to_string(),
            buffer_available,
            buffer_id,
            buffer_type,
            count,
            time_range,
        },
    );
    eprintln!(
        "[{}:{}] Stream ended (reason: {}, count: {})",
        log_prefix, session_id, reason, count
    );
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_standard_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0x11, 0x22, 0x33, 0x44],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded[0], 0xF1); // Sync
        assert_eq!(encoded[1], 0x00); // Command
        // Frame ID (little-endian): 0x123 = [0x23, 0x01, 0x00, 0x00]
        assert_eq!(encoded[2], 0x23);
        assert_eq!(encoded[3], 0x01);
        assert_eq!(encoded[4], 0x00);
        assert_eq!(encoded[5], 0x00);
        assert_eq!(encoded[6], 0x00); // Bus
        assert_eq!(encoded[7], 0x04); // Length
        assert_eq!(&encoded[8..], &[0x11, 0x22, 0x33, 0x44]);
    }

    #[test]
    fn test_encode_extended_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x12345678,
            data: vec![0xAA, 0xBB],
            bus: 1,
            is_extended: true,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded[0], 0xF1); // Sync
        assert_eq!(encoded[1], 0x00); // Command
        // Frame ID with extended flag (bit 31): 0x12345678 | 0x80000000 = 0x92345678
        // Little-endian: [0x78, 0x56, 0x34, 0x92]
        assert_eq!(encoded[2], 0x78);
        assert_eq!(encoded[3], 0x56);
        assert_eq!(encoded[4], 0x34);
        assert_eq!(encoded[5], 0x92);
        assert_eq!(encoded[6], 0x01); // Bus
        assert_eq!(encoded[7], 0x02); // Length
        assert_eq!(&encoded[8..], &[0xAA, 0xBB]);
    }

    #[test]
    fn test_encode_empty_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x7FF,
            data: vec![],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = encode_gvret_frame(&frame);

        assert_eq!(encoded.len(), 8); // Header only, no data
        assert_eq!(encoded[0], 0xF1);
        assert_eq!(encoded[1], 0x00);
        assert_eq!(encoded[6], 0x00); // Bus
        assert_eq!(encoded[7], 0x00); // Length = 0
    }

    #[test]
    fn test_parse_single_frame() {
        // F1 00 <ts:4> <id:4> <bus_dlc:1> <data:4>
        // Timestamp: 0x00000000 (not used for host time)
        // ID: 0x123 (standard)
        // Bus+DLC: 0x04 (bus 0, dlc 4)
        // Data: AA BB CC DD
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x23, 0x01, 0x00, 0x00, // ID 0x123 LE
            0x04, // Bus 0, DLC 4
            0xAA, 0xBB, 0xCC, 0xDD, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert!(!frame.is_extended);
        assert!(buffer.is_empty()); // Buffer should be consumed
    }

    #[test]
    fn test_parse_extended_frame() {
        // Extended frame with ID 0x12345678
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x78, 0x56, 0x34, 0x92, // ID 0x12345678 | 0x80000000 LE
            0x02, // Bus 0, DLC 2
            0x11, 0x22, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x12345678);
        assert!(frame.is_extended);
        assert_eq!(frame.bytes, vec![0x11, 0x22]);
    }

    #[test]
    fn test_parse_skips_control_frames() {
        // Mix of control frames and data frame
        let mut buffer = vec![
            0xF1, 0x09, 0xDE, 0xAD, // Keepalive (4 bytes)
            0xF1, 0x00, // Data frame start
            0x00, 0x00, 0x00, 0x00, // Timestamp
            0x7F, 0x00, 0x00, 0x00, // ID 0x7F
            0x01, // Bus 0, DLC 1
            0xFF, // Data
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert_eq!(frames.len(), 1);
        let (frame, _) = &frames[0];
        assert_eq!(frame.frame_id, 0x7F);
    }

    #[test]
    fn test_parse_incomplete_frame() {
        // Incomplete frame - not enough bytes
        let mut buffer = vec![
            0xF1, 0x00, // Sync + command
            0x00, 0x00, // Only 2 timestamp bytes
        ];

        let frames = parse_gvret_frames(&mut buffer);

        assert!(frames.is_empty());
        assert_eq!(buffer.len(), 4); // Buffer should be preserved
    }

    #[test]
    fn test_validate_classic_can_too_long() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0; 9], // 9 bytes - too long for classic CAN
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let result = validate_gvret_frame(&frame);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_canfd_too_long() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0; 65], // 65 bytes - too long for CAN FD
            bus: 0,
            is_extended: false,
            is_fd: true,
            is_brs: false,
            is_rtr: false,
        };

        let result = validate_gvret_frame(&frame);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_invalid_bus() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0x11],
            bus: 5, // Invalid - max is 4
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let result = validate_gvret_frame(&frame);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_valid_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0x11, 0x22, 0x33, 0x44],
            bus: 2,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let result = validate_gvret_frame(&frame);
        assert!(result.is_ok());
    }
}
