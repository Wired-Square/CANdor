// ui/src-tauri/src/framing.rs
//
// Tauri commands for backend framing operations.
// Converts raw serial bytes into structured frames using various protocols.

use crate::{
    buffer_store,
    io::FrameMessage,
    serial_framer::{extract_frame_id, FrameIdConfig, FramingEncoding, SerialFramer},
};

/// Configuration for backend framing
#[derive(Clone, serde::Deserialize)]
pub struct BackendFramingConfig {
    /// Framing mode: "raw", "slip", "modbus_rtu"
    pub mode: String,
    /// For raw mode: delimiter bytes as hex string (e.g., "0D0A")
    pub delimiter: Option<String>,
    /// For raw mode: max frame length before forced split
    pub max_length: Option<usize>,
    /// For modbus_rtu mode: whether to validate CRC
    pub validate_crc: Option<bool>,
    /// Minimum frame length to accept (frames shorter are discarded)
    pub min_length: Option<usize>,
    /// Frame ID extraction config
    pub frame_id_config: Option<FrameIdConfig>,
    /// Source address extraction config
    pub source_address_config: Option<FrameIdConfig>,
}

/// Result from backend framing operation
#[derive(Clone, serde::Serialize)]
pub struct FramingResult {
    /// Number of frames extracted
    pub frame_count: usize,
    /// ID of the new frame buffer
    pub buffer_id: String,
}

/// Parse hex string to bytes (e.g., "0D0A" -> [0x0D, 0x0A])
fn parse_hex_delimiter(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Hex string must have even length".to_string());
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte_str = &hex[i..i + 2];
        let byte = u8::from_str_radix(byte_str, 16)
            .map_err(|_| format!("Invalid hex byte: {}", byte_str))?;
        bytes.push(byte);
    }
    Ok(bytes)
}

/// Apply framing to the active byte buffer.
/// If `reuse_buffer_id` is provided and valid, that buffer will be cleared and reused.
/// Otherwise, a new frame buffer is created.
/// This avoids buffer proliferation during live framing.
#[tauri::command(rename_all = "snake_case")]
pub async fn apply_framing_to_buffer(
    config: BackendFramingConfig,
    reuse_buffer_id: Option<String>,
) -> Result<FramingResult, String> {
    // Get active byte buffer
    let buffer_id = buffer_store::get_active_buffer_id()
        .ok_or_else(|| "No active buffer".to_string())?;

    let bytes = buffer_store::get_buffer_bytes(&buffer_id)
        .ok_or_else(|| format!("Buffer '{}' not found or is not a byte buffer", buffer_id))?;

    if bytes.is_empty() {
        return Err("No bytes in buffer".to_string());
    }

    // Create framing encoding from config
    let encoding = match config.mode.as_str() {
        "slip" => FramingEncoding::Slip,
        "modbus_rtu" => FramingEncoding::ModbusRtu {
            device_address: None,
            validate_crc: config.validate_crc.unwrap_or(true),
        },
        "raw" => {
            let delimiter = if let Some(hex) = &config.delimiter {
                parse_hex_delimiter(hex)?
            } else {
                vec![0x0A] // Default LF
            };
            FramingEncoding::Delimiter {
                delimiter,
                max_length: config.max_length.unwrap_or(1024),
                include_delimiter: false,
            }
        }
        _ => return Err(format!("Unknown framing mode: {}", config.mode)),
    };

    // Track byte positions as we feed bytes one at a time
    // This gives us accurate start indices for timestamp lookup
    let mut framer = SerialFramer::new(encoding.clone());
    let mut frame_data: Vec<(Vec<u8>, usize, bool, Option<bool>)> = Vec::new(); // (bytes, start_idx, incomplete, crc_valid)
    let mut current_frame_start = 0usize;

    for (i, byte) in bytes.iter().enumerate() {
        let frames = framer.feed(&[byte.byte]);
        for frame in frames {
            frame_data.push((frame.bytes, current_frame_start, frame.incomplete, frame.crc_valid));
            current_frame_start = i + 1;
        }
    }

    // Handle flushed frame
    if let Some(frame) = framer.flush() {
        frame_data.push((frame.bytes, current_frame_start, frame.incomplete, frame.crc_valid));
    }

    // Apply minimum length filter
    let min_length = config.min_length.unwrap_or(1);

    // Convert to FrameMessage format
    let frame_messages: Vec<FrameMessage> = frame_data
        .iter()
        .enumerate()
        .filter(|(_, (frame_bytes, _, _, _))| frame_bytes.len() >= min_length)
        .map(|(idx, (frame_bytes, start_idx, incomplete, _crc_valid))| {
            // Get timestamp from first byte of frame
            let timestamp = bytes.get(*start_idx).map(|b| b.timestamp_us).unwrap_or(0);

            // Extract frame ID if configured
            let frame_id = if let Some(ref id_config) = config.frame_id_config {
                extract_frame_id(frame_bytes, id_config).unwrap_or(idx as u32)
            } else {
                idx as u32
            };

            // Extract source address if configured
            let source_address = if let Some(ref src_config) = config.source_address_config {
                extract_frame_id(frame_bytes, src_config).map(|v| v as u16)
            } else {
                None
            };

            FrameMessage {
                protocol: "serial".to_string(),
                timestamp_us: timestamp,
                frame_id,
                bus: 0,
                dlc: frame_bytes.len() as u8,
                bytes: frame_bytes.clone(),
                is_extended: false,
                is_fd: false,
                source_address,
                incomplete: if *incomplete { Some(true) } else { None },
                direction: None,
            }
        })
        .collect();

    let frame_count = frame_messages.len();

    if frame_count == 0 {
        return Err("No frames extracted (all filtered by min_length?)".to_string());
    }

    // Reuse existing buffer if provided and valid, otherwise create a new one.
    // This avoids buffer proliferation during live streaming.
    let target_buffer_id = if let Some(ref existing_id) = reuse_buffer_id {
        // Check if the buffer exists and is a frames buffer
        if buffer_store::get_buffer_type(existing_id) == Some(buffer_store::BufferType::Frames) {
            // Clear the existing buffer and reuse it
            buffer_store::clear_and_refill_buffer(existing_id, frame_messages);
            existing_id.clone()
        } else {
            // Buffer doesn't exist or is wrong type - create a new one
            let new_id = buffer_store::create_buffer_inactive(
                buffer_store::BufferType::Frames,
                format!("Framed from {}", buffer_id),
            );
            buffer_store::append_frames_to_buffer(&new_id, frame_messages);
            new_id
        }
    } else {
        // No buffer to reuse - create a new one
        let new_id = buffer_store::create_buffer_inactive(
            buffer_store::BufferType::Frames,
            format!("Framed from {}", buffer_id),
        );
        buffer_store::append_frames_to_buffer(&new_id, frame_messages);
        new_id
    };

    // Note: We don't finalize here - the bytes buffer stays active for HexDump,
    // and the frames buffer is just a derived view that FramedDataView fetches by ID.

    Ok(FramingResult {
        frame_count,
        buffer_id: target_buffer_id,
    })
}
