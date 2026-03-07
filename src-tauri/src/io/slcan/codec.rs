// ui/src-tauri/src/io/slcan/codec.rs
//
// slcan (Serial Line CAN) ASCII protocol codec.
//
// Protocol reference: http://www.can232.com/docs/can232_v3.pdf
// CAN FD extension: ELMUE CANable 2.5 firmware
//   https://github.com/Elmue/CANable-2.5-firmware-Slcan-and-Candlelight
//
// Frame formats (classic CAN):
//   Standard: t<ID:3hex><DLC:1hex><DATA:2hex*DLC>\r
//   Extended: T<ID:8hex><DLC:1hex><DATA:2hex*DLC>\r
//   RTR:      r<ID:3hex><DLC:1hex>\r / R<ID:8hex><DLC:1hex>\r
//
// Frame formats (CAN FD, ELMUE extension):
//   FD standard:          d<ID:3hex><DLC:1hex><DATA:2hex*len>\r
//   FD extended:          D<ID:8hex><DLC:1hex><DATA:2hex*len>\r
//   FD+BRS standard:      b<ID:3hex><DLC:1hex><DATA:2hex*len>\r
//   FD+BRS extended:      B<ID:8hex><DLC:1hex><DATA:2hex*len>\r
//
// For CAN FD, the DLC hex digit 9-F maps to 12,16,20,24,32,48,64 bytes.

#![allow(dead_code)]

use crate::io::error::IoError;
use crate::io::{now_us, CanTransmitFrame, FrameMessage};
use crate::io::codec::FrameCodec;

/// CAN FD DLC-to-payload-length mapping (ISO 11898-2:2015).
const DLC_LEN: [usize; 16] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];

/// slcan (Serial Line CAN) ASCII protocol codec.
pub struct SlcanCodec;

impl FrameCodec for SlcanCodec {
    /// Raw frame is an ASCII string (without trailing \r)
    type RawFrame = str;
    /// Encoded frame is a Vec<u8> (ASCII bytes with trailing \r)
    type EncodedFrame = Vec<u8>;

    /// Decode an slcan ASCII frame line.
    ///
    /// Examples:
    ///   `t1234AABBCCDD` -> Standard frame, ID=0x123, DLC=4, data=AA BB CC DD
    ///   `T123456788AABBCCDD112233445566` -> Extended frame, ID=0x12345678, DLC=8
    ///   `r1230` -> Standard RTR, ID=0x123, DLC=0
    ///   `d7E09112233445566778899AABBCC` -> FD frame, ID=0x7E0, DLC=9 (12 bytes)
    ///   `b7E0F...64 hex bytes...` -> FD+BRS frame, ID=0x7E0, DLC=F (64 bytes)
    fn decode(line: &str) -> Result<FrameMessage, IoError> {
        let bytes = line.as_bytes();
        if bytes.is_empty() {
            return Err(IoError::protocol("slcan", "empty frame"));
        }

        // Determine frame type from first character
        let (is_extended, is_rtr, is_fd, is_brs) = match bytes[0] {
            b't' => (false, false, false, false),
            b'T' => (true,  false, false, false),
            b'r' => (false, true,  false, false),
            b'R' => (true,  true,  false, false),
            b'd' => (false, false, true,  false),
            b'D' => (true,  false, true,  false),
            b'b' => (false, false, true,  true),
            b'B' => (true,  false, true,  true),
            c => {
                return Err(IoError::protocol(
                    "slcan",
                    format!("invalid frame prefix: '{}'", c as char),
                ))
            }
        };
        let _ = is_brs; // BRS is encoded in the prefix; no separate field in FrameMessage

        let id_len = if is_extended { 8 } else { 3 };
        let min_len = 1 + id_len + 1; // prefix + ID + DLC

        if bytes.len() < min_len {
            return Err(IoError::protocol(
                "slcan",
                format!(
                    "frame too short: {} bytes, need at least {}",
                    bytes.len(),
                    min_len
                ),
            ));
        }

        // Parse frame ID (hex ASCII)
        let id_str = std::str::from_utf8(&bytes[1..1 + id_len])
            .map_err(|_| IoError::protocol("slcan", "invalid UTF-8 in frame ID"))?;
        let frame_id = u32::from_str_radix(id_str, 16)
            .map_err(|_| IoError::protocol("slcan", format!("invalid hex ID: {}", id_str)))?;

        // Parse DLC (single hex digit: 0-8 for classic, 0-F for FD)
        let dlc_char = bytes[1 + id_len] as char;
        let dlc_code = dlc_char.to_digit(16).ok_or_else(|| {
            IoError::protocol("slcan", format!("invalid DLC character: '{}'", dlc_char))
        })? as u8;

        let max_dlc = if is_fd { 15 } else { 8 };
        if dlc_code > max_dlc {
            return Err(IoError::protocol(
                "slcan",
                format!("invalid DLC: {} (max {})", dlc_code, max_dlc),
            ));
        }

        // For FD frames, map DLC code to actual byte count via DLC_LEN table
        let data_len = if is_fd {
            DLC_LEN[dlc_code as usize]
        } else {
            dlc_code as usize
        };

        // Parse data bytes (pairs of hex characters)
        let mut data = Vec::with_capacity(data_len);
        if !is_rtr && data_len > 0 {
            let data_start = 1 + id_len + 1;
            let expected_len = data_start + (data_len * 2);

            if bytes.len() < expected_len {
                return Err(IoError::protocol(
                    "slcan",
                    format!(
                        "incomplete data: {} bytes, need {}",
                        bytes.len(),
                        expected_len
                    ),
                ));
            }

            for i in 0..data_len {
                let byte_str = std::str::from_utf8(&bytes[data_start + i * 2..data_start + i * 2 + 2])
                    .map_err(|_| IoError::protocol("slcan", "invalid UTF-8 in data bytes"))?;
                let byte = u8::from_str_radix(byte_str, 16).map_err(|_| {
                    IoError::protocol("slcan", format!("invalid hex byte: {}", byte_str))
                })?;
                data.push(byte);
            }
        }

        Ok(FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: now_us(),
            frame_id,
            bus: 0,
            dlc: data_len as u8,
            bytes: data,
            is_extended,
            is_fd,
            source_address: None,
            incomplete: None,
            direction: None,
        })
    }

    /// Encode a CAN frame to slcan ASCII format.
    ///
    /// Returns ASCII bytes including trailing `\r`.
    fn encode(frame: &CanTransmitFrame) -> Result<Vec<u8>, IoError> {
        let max_len = if frame.is_fd { 64 } else { 8 };
        if frame.data.len() > max_len {
            return Err(IoError::protocol(
                "slcan",
                format!(
                    "data too long for slcan: {} bytes (max {})",
                    frame.data.len(),
                    max_len
                ),
            ));
        }

        let mut cmd = String::with_capacity(if frame.is_fd { 140 } else { 32 });

        // Frame type prefix and ID
        if frame.is_fd {
            // CAN FD: d/D (no BRS) or b/B (with BRS)
            if frame.is_brs {
                cmd.push(if frame.is_extended { 'B' } else { 'b' });
            } else {
                cmd.push(if frame.is_extended { 'D' } else { 'd' });
            }
        } else {
            cmd.push(if frame.is_extended { 'T' } else { 't' });
        }

        if frame.is_extended {
            cmd.push_str(&format!("{:08X}", frame.frame_id));
        } else {
            cmd.push_str(&format!("{:03X}", frame.frame_id & 0x7FF));
        }

        // DLC: for FD, reverse-lookup from DLC_LEN to find the DLC code
        let dlc_code = if frame.is_fd {
            len_to_fd_dlc(frame.data.len())
        } else {
            frame.data.len().min(8) as u8
        };
        cmd.push_str(&format!("{:X}", dlc_code));

        // Data bytes
        for byte in &frame.data {
            cmd.push_str(&format!("{:02X}", byte));
        }

        cmd.push('\r');
        Ok(cmd.into_bytes())
    }
}

/// Convert a data length to the CAN FD DLC code.
/// Finds the smallest DLC code whose length >= the given length.
fn len_to_fd_dlc(len: usize) -> u8 {
    DLC_LEN.iter().position(|&l| l >= len).unwrap_or(15) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slcan_decode_standard_frame() {
        let frame = SlcanCodec::decode("t1234AABBCCDD").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        assert!(!frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_extended_frame() {
        let frame = SlcanCodec::decode("T123456782AABB").unwrap();
        assert_eq!(frame.frame_id, 0x12345678);
        assert_eq!(frame.dlc, 2);
        assert_eq!(frame.bytes, vec![0xAA, 0xBB]);
        assert!(frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_zero_dlc() {
        let frame = SlcanCodec::decode("t1230").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 0);
        assert!(frame.bytes.is_empty());
    }

    #[test]
    fn test_slcan_decode_rtr() {
        let frame = SlcanCodec::decode("r1234").unwrap();
        assert_eq!(frame.frame_id, 0x123);
        assert_eq!(frame.dlc, 4);
        assert!(frame.bytes.is_empty()); // RTR has no data
    }

    #[test]
    fn test_slcan_decode_invalid_prefix() {
        assert!(SlcanCodec::decode("x1234AABB").is_err());
        assert!(SlcanCodec::decode("").is_err());
    }

    #[test]
    fn test_slcan_encode_standard_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x123,
            data: vec![0x01, 0x02, 0x03],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&frame).unwrap();
        assert_eq!(encoded, b"t1233010203\r");
    }

    #[test]
    fn test_slcan_encode_extended_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x12345678,
            data: vec![0xAA, 0xBB],
            bus: 0,
            is_extended: true,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&frame).unwrap();
        assert_eq!(encoded, b"T123456782AABB\r");
    }

    #[test]
    fn test_slcan_roundtrip() {
        let original = CanTransmitFrame {
            frame_id: 0x7FF,
            data: vec![0xDE, 0xAD, 0xBE, 0xEF],
            bus: 0,
            is_extended: false,
            is_fd: false,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&original).unwrap();
        // Remove trailing \r for parsing
        let encoded_str = std::str::from_utf8(&encoded[..encoded.len() - 1]).unwrap();
        let decoded = SlcanCodec::decode(encoded_str).unwrap();

        assert_eq!(decoded.frame_id, original.frame_id);
        assert_eq!(decoded.bytes, original.data);
    }

    // =========================================================================
    // CAN FD tests (ELMUE firmware extension)
    // =========================================================================

    #[test]
    fn test_slcan_decode_fd_standard_12bytes() {
        // d prefix = FD 11-bit, no BRS. DLC '9' = 12 bytes.
        let frame = SlcanCodec::decode("d7E09112233445566778899AABBCC").unwrap();
        assert_eq!(frame.frame_id, 0x7E0);
        assert_eq!(frame.dlc, 12);
        assert_eq!(frame.bytes.len(), 12);
        assert_eq!(frame.bytes[0], 0x11);
        assert_eq!(frame.bytes[11], 0xCC);
        assert!(frame.is_fd);
        assert!(!frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_fd_extended_16bytes() {
        // D prefix = FD 29-bit, no BRS. DLC 'A' = 16 bytes.
        let data_hex = "00112233445566778899AABBCCDDEEFF";
        let line = format!("D12345678A{}", data_hex);
        let frame = SlcanCodec::decode(&line).unwrap();
        assert_eq!(frame.frame_id, 0x12345678);
        assert_eq!(frame.dlc, 16);
        assert_eq!(frame.bytes.len(), 16);
        assert!(frame.is_fd);
        assert!(frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_fd_brs_64bytes() {
        // b prefix = FD 11-bit, with BRS. DLC 'F' = 64 bytes.
        let data_hex = "42".repeat(64);
        let line = format!("b100F{}", data_hex);
        let frame = SlcanCodec::decode(&line).unwrap();
        assert_eq!(frame.frame_id, 0x100);
        assert_eq!(frame.dlc, 64);
        assert_eq!(frame.bytes.len(), 64);
        assert!(frame.bytes.iter().all(|&b| b == 0x42));
        assert!(frame.is_fd);
        assert!(!frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_fd_brs_extended() {
        // B prefix = FD 29-bit, with BRS
        let data_hex = "C0FFEE42".repeat(6); // 24 bytes, DLC 'C'
        let line = format!("B00000456C{}", data_hex);
        let frame = SlcanCodec::decode(&line).unwrap();
        assert_eq!(frame.frame_id, 0x456);
        assert_eq!(frame.dlc, 24);
        assert_eq!(frame.bytes.len(), 24);
        assert!(frame.is_fd);
        assert!(frame.is_extended);
    }

    #[test]
    fn test_slcan_decode_fd_classic_dlc_8() {
        // FD frame with DLC 8 = 8 bytes (same as classic)
        let frame = SlcanCodec::decode("d1008AABBCCDDEEFF0011").unwrap();
        assert_eq!(frame.dlc, 8);
        assert_eq!(frame.bytes.len(), 8);
        assert!(frame.is_fd);
    }

    #[test]
    fn test_slcan_encode_fd_frame() {
        let frame = CanTransmitFrame {
            frame_id: 0x7E0,
            data: vec![0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC],
            bus: 0,
            is_extended: false,
            is_fd: true,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&frame).unwrap();
        assert_eq!(encoded, b"d7E09112233445566778899AABBCC\r");
    }

    #[test]
    fn test_slcan_encode_fd_brs_extended() {
        let frame = CanTransmitFrame {
            frame_id: 0x456,
            data: vec![0xAA; 64],
            bus: 0,
            is_extended: true,
            is_fd: true,
            is_brs: true,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&frame).unwrap();
        let encoded_str = std::str::from_utf8(&encoded).unwrap();
        assert!(encoded_str.starts_with("B00000456F"));
        assert!(encoded_str.ends_with("\r"));
        // 1 prefix + 8 ID + 1 DLC + 128 data hex + 1 \r = 139 chars
        assert_eq!(encoded.len(), 139);
    }

    #[test]
    fn test_slcan_fd_roundtrip() {
        let original = CanTransmitFrame {
            frame_id: 0x100,
            data: vec![0xC0, 0xFF, 0xEE, 0x42, 0xC0, 0xFF, 0xEE, 0x42,
                       0xC0, 0xFF, 0xEE, 0x42, 0xC0, 0xFF, 0xEE, 0x42],
            bus: 0,
            is_extended: false,
            is_fd: true,
            is_brs: false,
            is_rtr: false,
        };

        let encoded = SlcanCodec::encode(&original).unwrap();
        let encoded_str = std::str::from_utf8(&encoded[..encoded.len() - 1]).unwrap();
        let decoded = SlcanCodec::decode(encoded_str).unwrap();

        assert_eq!(decoded.frame_id, original.frame_id);
        assert_eq!(decoded.bytes, original.data);
        assert!(decoded.is_fd);
        assert_eq!(decoded.dlc, 16);
    }

    #[test]
    fn test_len_to_fd_dlc() {
        assert_eq!(len_to_fd_dlc(0), 0);
        assert_eq!(len_to_fd_dlc(8), 8);
        assert_eq!(len_to_fd_dlc(12), 9);
        assert_eq!(len_to_fd_dlc(16), 10);
        assert_eq!(len_to_fd_dlc(20), 11);
        assert_eq!(len_to_fd_dlc(24), 12);
        assert_eq!(len_to_fd_dlc(32), 13);
        assert_eq!(len_to_fd_dlc(48), 14);
        assert_eq!(len_to_fd_dlc(64), 15);
        // Non-standard lengths should round up to next valid DLC
        assert_eq!(len_to_fd_dlc(10), 9);  // 10 -> DLC 9 (12 bytes)
        assert_eq!(len_to_fd_dlc(50), 15); // 50 -> DLC 15 (64 bytes)
    }
}
