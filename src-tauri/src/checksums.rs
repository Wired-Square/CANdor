// ui/src-tauri/src/checksums.rs
//
// Checksum calculation algorithms for frame validation.
// Exposed to the frontend via Tauri commands.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

// ============================================================================
// Types
// ============================================================================

/// Supported checksum algorithms.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChecksumAlgorithm {
    /// XOR of all bytes
    Xor,
    /// sum(bytes) & 0xFF
    Sum8,
    /// CRC-8 polynomial 0x07 (ITU/SMBUS)
    Crc8,
    /// CRC-8 SAE-J1850 polynomial 0x1D (automotive OBD-II)
    Crc8SaeJ1850,
    /// CRC-8 AUTOSAR polynomial 0x2F (AUTOSAR E2E)
    Crc8Autosar,
    /// CRC-8 Maxim polynomial 0x31 (1-Wire devices)
    Crc8Maxim,
    /// CRC-8 CDMA2000 polynomial 0x9B (telecom)
    Crc8Cdma2000,
    /// CRC-8 DVB-S2 polynomial 0xD5 (satellite)
    Crc8DvbS2,
    /// CRC-8 Nissan polynomial 0x85 (Nissan CAN)
    Crc8Nissan,
    /// CRC-16 Modbus polynomial (0xA001)
    Crc16Modbus,
    /// CRC-16 CCITT polynomial (0x1021)
    Crc16Ccitt,
}

/// Every algorithm the sweep considers, in preference order — ties in scoring
/// break towards the earlier entry, so the simple ones come first.
pub const ALL_ALGORITHMS: [ChecksumAlgorithm; 11] = [
    ChecksumAlgorithm::Xor,
    ChecksumAlgorithm::Sum8,
    ChecksumAlgorithm::Crc8,
    ChecksumAlgorithm::Crc8SaeJ1850,
    ChecksumAlgorithm::Crc8Autosar,
    ChecksumAlgorithm::Crc8Maxim,
    ChecksumAlgorithm::Crc8Cdma2000,
    ChecksumAlgorithm::Crc8DvbS2,
    ChecksumAlgorithm::Crc8Nissan,
    ChecksumAlgorithm::Crc16Modbus,
    ChecksumAlgorithm::Crc16Ccitt,
];

impl ChecksumAlgorithm {
    /// Get the output size in bytes for this algorithm.
    pub fn output_bytes(&self) -> usize {
        match self {
            ChecksumAlgorithm::Xor => 1,
            ChecksumAlgorithm::Sum8 => 1,
            ChecksumAlgorithm::Crc8 => 1,
            ChecksumAlgorithm::Crc8SaeJ1850 => 1,
            ChecksumAlgorithm::Crc8Autosar => 1,
            ChecksumAlgorithm::Crc8Maxim => 1,
            ChecksumAlgorithm::Crc8Cdma2000 => 1,
            ChecksumAlgorithm::Crc8DvbS2 => 1,
            ChecksumAlgorithm::Crc8Nissan => 1,
            ChecksumAlgorithm::Crc16Modbus => 2,
            ChecksumAlgorithm::Crc16Ccitt => 2,
        }
    }

    /// Parse algorithm from string (for Tauri command).
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "xor" => Ok(ChecksumAlgorithm::Xor),
            "sum8" => Ok(ChecksumAlgorithm::Sum8),
            "crc8" => Ok(ChecksumAlgorithm::Crc8),
            "crc8_sae_j1850" => Ok(ChecksumAlgorithm::Crc8SaeJ1850),
            "crc8_autosar" => Ok(ChecksumAlgorithm::Crc8Autosar),
            "crc8_maxim" => Ok(ChecksumAlgorithm::Crc8Maxim),
            "crc8_cdma2000" => Ok(ChecksumAlgorithm::Crc8Cdma2000),
            "crc8_dvb_s2" => Ok(ChecksumAlgorithm::Crc8DvbS2),
            "crc8_nissan" => Ok(ChecksumAlgorithm::Crc8Nissan),
            "crc16_modbus" => Ok(ChecksumAlgorithm::Crc16Modbus),
            "crc16_ccitt" => Ok(ChecksumAlgorithm::Crc16Ccitt),
            _ => Err(format!("Unknown checksum algorithm: {}", s)),
        }
    }
}

/// Result of checksum validation (for Tauri command response).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChecksumValidationResult {
    /// The checksum value extracted from the frame
    pub extracted: u16,
    /// The calculated checksum value
    pub calculated: u16,
    /// Whether the checksum is valid (extracted == calculated)
    pub valid: bool,
}

/// Result of batch checksum discovery (for Tauri command response).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchDiscoveryResult {
    /// Number of frames that matched
    pub match_count: usize,
    /// Total number of frames tested
    pub total_count: usize,
}

// ============================================================================
// Byte Index Resolution (Negative Indexing Support)
// ============================================================================

/// Resolve a byte index, supporting Python-style negative indexing.
/// Negative indices count from the end: -1 = last byte, -2 = second-to-last, etc.
///
/// # Arguments
/// * `index` - The byte index (can be negative)
/// * `frame_length` - Total frame length in bytes
///
/// # Returns
/// The resolved absolute byte index
pub fn resolve_byte_index(index: i32, frame_length: usize) -> usize {
    if index >= 0 {
        index as usize
    } else {
        // Negative: count from end
        // -1 -> frame_length - 1 (last byte)
        // -2 -> frame_length - 2 (second-to-last)
        let abs_index = (-index) as usize;
        frame_length.saturating_sub(abs_index)
    }
}

// ============================================================================
// Reflection Helpers
// ============================================================================

/// Reflect (reverse) the bits of a byte.
fn reflect8(mut value: u8) -> u8 {
    let mut result: u8 = 0;
    for _ in 0..8 {
        result = (result << 1) | (value & 1);
        value >>= 1;
    }
    result
}

/// Reflect (reverse) the bits of a 16-bit value.
fn reflect16(mut value: u16) -> u16 {
    let mut result: u16 = 0;
    for _ in 0..16 {
        result = (result << 1) | (value & 1);
        value >>= 1;
    }
    result
}

// ============================================================================
// Parameterised CRC Functions (Canonical Implementations)
// ============================================================================

/// CRC-8 with arbitrary parameters.
///
/// # Arguments
/// * `data` - The data to calculate CRC over
/// * `polynomial` - The CRC polynomial (e.g., 0x07 for standard CRC-8)
/// * `init` - Initial CRC value (e.g., 0x00 or 0xFF)
/// * `xor_out` - Final XOR value (e.g., 0x00 or 0xFF)
/// * `reflect` - Whether to use reflected (LSB-first) mode
pub fn crc8_parameterised(
    data: &[u8],
    polynomial: u8,
    init: u8,
    xor_out: u8,
    reflect: bool,
) -> u8 {
    let mut crc = init;

    if reflect {
        // Reflected mode (LSB-first processing)
        let reflected_poly = reflect8(polynomial);
        for &byte in data {
            crc ^= byte;
            for _ in 0..8 {
                if crc & 0x01 != 0 {
                    crc = (crc >> 1) ^ reflected_poly;
                } else {
                    crc >>= 1;
                }
            }
        }
    } else {
        // Normal mode (MSB-first processing)
        for &byte in data {
            crc ^= byte;
            for _ in 0..8 {
                if crc & 0x80 != 0 {
                    crc = (crc << 1) ^ polynomial;
                } else {
                    crc <<= 1;
                }
            }
        }
    }

    crc ^ xor_out
}

/// CRC-16 with arbitrary parameters.
///
/// # Arguments
/// * `data` - The data to calculate CRC over
/// * `polynomial` - The CRC polynomial (e.g., 0x8005 for CRC-16)
/// * `init` - Initial CRC value (e.g., 0x0000 or 0xFFFF)
/// * `xor_out` - Final XOR value (e.g., 0x0000 or 0xFFFF)
/// * `reflect_in` - Whether to reflect input bytes
/// * `reflect_out` - Whether to reflect the final CRC output
pub fn crc16_parameterised(
    data: &[u8],
    polynomial: u16,
    init: u16,
    xor_out: u16,
    reflect_in: bool,
    reflect_out: bool,
) -> u16 {
    let mut crc = init;

    if reflect_in {
        // Reflected input mode (LSB-first)
        let reflected_poly = reflect16(polynomial);
        for &byte in data {
            crc ^= byte as u16;
            for _ in 0..8 {
                if crc & 0x0001 != 0 {
                    crc = (crc >> 1) ^ reflected_poly;
                } else {
                    crc >>= 1;
                }
            }
        }
    } else {
        // Normal input mode (MSB-first)
        for &byte in data {
            crc ^= (byte as u16) << 8;
            for _ in 0..8 {
                if crc & 0x8000 != 0 {
                    crc = (crc << 1) ^ polynomial;
                } else {
                    crc <<= 1;
                }
            }
        }
    }

    let final_crc = if reflect_out && !reflect_in {
        // Only reflect output if not already reflected via input processing
        reflect16(crc)
    } else if !reflect_out && reflect_in {
        // Need to un-reflect if input was reflected but output shouldn't be
        reflect16(crc)
    } else {
        crc
    };

    final_crc ^ xor_out
}

// ============================================================================
// Named Checksum Functions
// ============================================================================

/// XOR of all bytes.
/// Simple but effective for detecting single-bit errors.
pub fn xor_checksum(data: &[u8]) -> u8 {
    let mut result: u8 = 0;
    for &byte in data {
        result ^= byte;
    }
    result
}

/// Simple modulo-256 sum of bytes (8-bit sum).
pub fn sum8_checksum(data: &[u8]) -> u8 {
    let mut sum: u8 = 0;
    for &byte in data {
        sum = sum.wrapping_add(byte);
    }
    sum
}

/// CRC-8 with polynomial 0x07 (ITU/SMBUS).
/// Common in many embedded protocols.
pub fn crc8_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x07, 0x00, 0x00, false)
}

/// CRC-8 SAE-J1850 with polynomial 0x1D.
/// Used in automotive OBD-II and CAN protocols.
/// Init: 0xFF, XOR out: 0xFF, Not reflected
pub fn crc8_sae_j1850_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x1D, 0xFF, 0xFF, false)
}

/// CRC-8 AUTOSAR with polynomial 0x2F.
/// Used in AUTOSAR E2E protection.
/// Init: 0xFF, XOR out: 0xFF, Not reflected
pub fn crc8_autosar_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x2F, 0xFF, 0xFF, false)
}

/// CRC-8 Maxim with polynomial 0x31.
/// Used in Dallas/Maxim 1-Wire devices.
/// Init: 0x00, XOR out: 0x00, Reflected (LSB-first)
pub fn crc8_maxim_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x31, 0x00, 0x00, true)
}

/// CRC-8 CDMA2000 with polynomial 0x9B.
/// Used in telecom protocols.
/// Init: 0xFF, XOR out: 0x00, Not reflected
pub fn crc8_cdma2000_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x9B, 0xFF, 0x00, false)
}

/// CRC-8 DVB-S2 with polynomial 0xD5.
/// Used in satellite communications.
/// Init: 0x00, XOR out: 0x00, Not reflected
pub fn crc8_dvb_s2_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0xD5, 0x00, 0x00, false)
}

/// CRC-8 Nissan with polynomial 0x85.
/// Used in Nissan LEAF CAN bus.
/// Init: 0x00, XOR out: 0x00, Not reflected
pub fn crc8_nissan_checksum(data: &[u8]) -> u8 {
    crc8_parameterised(data, 0x85, 0x00, 0x00, false)
}

/// CRC-16 Modbus polynomial (0x8005, reflected).
/// Used by Modbus RTU protocol.
pub fn crc16_modbus_checksum(data: &[u8]) -> u16 {
    crc16_parameterised(data, 0x8005, 0xFFFF, 0x0000, true, true)
}

/// CRC-16 CCITT polynomial (0x1021, non-reflected).
/// Common in telecommunications and some industrial protocols.
pub fn crc16_ccitt_checksum(data: &[u8]) -> u16 {
    crc16_parameterised(data, 0x1021, 0xFFFF, 0x0000, false, false)
}

// ============================================================================
// High-Level Functions
// ============================================================================

/// Calculate checksum using the specified algorithm.
///
/// # Arguments
/// * `algorithm` - The checksum algorithm to use
/// * `data` - The data to calculate checksum over
///
/// # Returns
/// The calculated checksum value as u16 (may be 8-bit for some algorithms)
pub fn calculate_checksum_simple(algorithm: ChecksumAlgorithm, data: &[u8]) -> u16 {
    match algorithm {
        ChecksumAlgorithm::Xor => xor_checksum(data) as u16,
        ChecksumAlgorithm::Sum8 => sum8_checksum(data) as u16,
        ChecksumAlgorithm::Crc8 => crc8_checksum(data) as u16,
        ChecksumAlgorithm::Crc8SaeJ1850 => crc8_sae_j1850_checksum(data) as u16,
        ChecksumAlgorithm::Crc8Autosar => crc8_autosar_checksum(data) as u16,
        ChecksumAlgorithm::Crc8Maxim => crc8_maxim_checksum(data) as u16,
        ChecksumAlgorithm::Crc8Cdma2000 => crc8_cdma2000_checksum(data) as u16,
        ChecksumAlgorithm::Crc8DvbS2 => crc8_dvb_s2_checksum(data) as u16,
        ChecksumAlgorithm::Crc8Nissan => crc8_nissan_checksum(data) as u16,
        ChecksumAlgorithm::Crc16Modbus => crc16_modbus_checksum(data),
        ChecksumAlgorithm::Crc16Ccitt => crc16_ccitt_checksum(data),
    }
}

/// Calculate checksum using the specified algorithm with byte range.
///
/// # Arguments
/// * `algorithm` - The checksum algorithm to use
/// * `data` - The complete frame data
/// * `calc_start_byte` - First byte index to include in calculation (supports negative indexing)
/// * `calc_end_byte` - Last byte index (exclusive) to include in calculation (supports negative indexing)
///
/// # Returns
/// The calculated checksum value
pub fn calculate_checksum(
    algorithm: ChecksumAlgorithm,
    data: &[u8],
    calc_start_byte: i32,
    calc_end_byte: i32,
) -> u16 {
    let length = data.len();

    // Resolve negative indices (e.g., -1 = last byte)
    let resolved_start = resolve_byte_index(calc_start_byte, length);
    let resolved_end = resolve_byte_index(calc_end_byte, length);

    // Ensure valid bounds
    let start = resolved_start.min(length);
    let end = resolved_end.min(length);

    if start >= end {
        return 0;
    }

    calculate_checksum_simple(algorithm, &data[start..end])
}

/// Extract checksum value from frame data.
///
/// # Arguments
/// * `data` - The complete frame data
/// * `start_byte` - Byte offset where checksum is stored (supports negative indexing)
/// * `byte_length` - Length of checksum (1 or 2 bytes)
/// * `big_endian` - true for big-endian, false for little-endian
///
/// # Returns
/// The extracted checksum value
pub fn extract_checksum(
    data: &[u8],
    start_byte: i32,
    byte_length: usize,
    big_endian: bool,
) -> u16 {
    let length = data.len();

    // Resolve negative index (e.g., -1 = last byte)
    let resolved_start = resolve_byte_index(start_byte, length);

    if resolved_start + byte_length > length {
        return 0;
    }

    match byte_length {
        1 => data[resolved_start] as u16,
        2 => {
            if big_endian {
                ((data[resolved_start] as u16) << 8) | (data[resolved_start + 1] as u16)
            } else {
                (data[resolved_start] as u16) | ((data[resolved_start + 1] as u16) << 8)
            }
        }
        _ => {
            // For lengths > 2, read based on endianness
            let mut value: u16 = 0;
            for i in 0..byte_length.min(2) {
                if big_endian {
                    value = (value << 8) | (data[resolved_start + i] as u16);
                } else {
                    value |= (data[resolved_start + i] as u16) << (i * 8);
                }
            }
            value
        }
    }
}

/// Validate a checksum in frame data.
///
/// # Arguments
/// * `algorithm` - The checksum algorithm to use
/// * `data` - The complete frame data
/// * `start_byte` - Byte offset where checksum is stored
/// * `byte_length` - Length of checksum (1 or 2 bytes)
/// * `big_endian` - true for big-endian, false for little-endian
/// * `calc_start_byte` - First byte to include in calculation
/// * `calc_end_byte` - Last byte (exclusive) to include in calculation
///
/// # Returns
/// ChecksumValidationResult with extracted value, calculated value, and validity
pub fn validate_checksum(
    algorithm: ChecksumAlgorithm,
    data: &[u8],
    start_byte: i32,
    byte_length: usize,
    big_endian: bool,
    calc_start_byte: i32,
    calc_end_byte: i32,
) -> ChecksumValidationResult {
    let extracted = extract_checksum(data, start_byte, byte_length, big_endian);
    let calculated = calculate_checksum(algorithm, data, calc_start_byte, calc_end_byte);

    ChecksumValidationResult {
        extracted,
        calculated,
        valid: extracted == calculated,
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Calculate checksum using the specified algorithm with byte range.
///
/// # Arguments
/// * `algorithm` - Algorithm name: "xor", "sum8", "crc8", "crc16_modbus", "crc16_ccitt"
/// * `data` - The complete frame data as bytes
/// * `calc_start_byte` - First byte index to include (supports negative indexing)
/// * `calc_end_byte` - Last byte index exclusive (supports negative indexing)
#[tauri::command]
pub fn calculate_checksum_cmd(
    algorithm: String,
    data: Vec<u8>,
    calc_start_byte: i32,
    calc_end_byte: i32,
) -> Result<u16, String> {
    let algo = ChecksumAlgorithm::from_str(&algorithm)?;
    Ok(calculate_checksum(algo, &data, calc_start_byte, calc_end_byte))
}

/// Validate a checksum in frame data.
///
/// # Arguments
/// * `algorithm` - Algorithm name: "xor", "sum8", "crc8", "crc16_modbus", "crc16_ccitt"
/// * `data` - The complete frame data as bytes
/// * `start_byte` - Byte offset where checksum is stored (supports negative indexing)
/// * `byte_length` - Length of checksum (1 or 2 bytes)
/// * `big_endian` - true for big-endian, false for little-endian
/// * `calc_start_byte` - First byte to include in calculation (supports negative indexing)
/// * `calc_end_byte` - Last byte (exclusive) to include (supports negative indexing)
#[tauri::command]
pub fn validate_checksum_cmd(
    algorithm: String,
    data: Vec<u8>,
    start_byte: i32,
    byte_length: usize,
    big_endian: bool,
    calc_start_byte: i32,
    calc_end_byte: i32,
) -> Result<ChecksumValidationResult, String> {
    let algo = ChecksumAlgorithm::from_str(&algorithm)?;
    Ok(validate_checksum(
        algo,
        &data,
        start_byte,
        byte_length,
        big_endian,
        calc_start_byte,
        calc_end_byte,
    ))
}

/// Resolve a byte index, supporting negative indexing.
///
/// # Arguments
/// * `index` - The byte index (can be negative, -1 = last byte)
/// * `frame_length` - Total frame length in bytes
#[tauri::command]
pub fn resolve_byte_index_cmd(index: i32, frame_length: usize) -> usize {
    resolve_byte_index(index, frame_length)
}

/// Calculate CRC-8 with arbitrary parameters.
///
/// # Arguments
/// * `data` - The data to calculate CRC over
/// * `polynomial` - The CRC polynomial (0x00-0xFF)
/// * `init` - Initial CRC value
/// * `xor_out` - Final XOR value
/// * `reflect` - Whether to use reflected (LSB-first) mode
#[tauri::command]
pub fn crc8_parameterised_cmd(
    data: Vec<u8>,
    polynomial: u8,
    init: u8,
    xor_out: u8,
    reflect: bool,
) -> u8 {
    crc8_parameterised(&data, polynomial, init, xor_out, reflect)
}

/// Calculate CRC-16 with arbitrary parameters.
///
/// # Arguments
/// * `data` - The data to calculate CRC over
/// * `polynomial` - The CRC polynomial (0x0000-0xFFFF)
/// * `init` - Initial CRC value
/// * `xor_out` - Final XOR value
/// * `reflect_in` - Whether to reflect input bytes
/// * `reflect_out` - Whether to reflect the final CRC output
#[tauri::command]
pub fn crc16_parameterised_cmd(
    data: Vec<u8>,
    polynomial: u16,
    init: u16,
    xor_out: u16,
    reflect_in: bool,
    reflect_out: bool,
) -> u16 {
    crc16_parameterised(&data, polynomial, init, xor_out, reflect_in, reflect_out)
}

/// Batch test a CRC configuration against multiple payloads.
/// This is optimised for checksum discovery - tests one polynomial/config
/// against many frames in a single IPC call.
///
/// # Arguments
/// * `payloads` - Array of frame payloads to test
/// * `expected_checksums` - Expected checksum values for each payload
/// * `checksum_bits` - 8 for CRC-8, 16 for CRC-16
/// * `polynomial` - The CRC polynomial to test
/// * `init` - Initial CRC value
/// * `xor_out` - Final XOR value
/// * `reflect` - Whether to use reflected mode
#[tauri::command]
pub fn batch_test_crc_cmd(
    payloads: Vec<Vec<u8>>,
    expected_checksums: Vec<u16>,
    checksum_bits: u8,
    polynomial: u16,
    init: u16,
    xor_out: u16,
    reflect: bool,
) -> BatchDiscoveryResult {
    let total_count = payloads.len().min(expected_checksums.len());
    let mut match_count = 0;

    for i in 0..total_count {
        let payload = &payloads[i];
        let expected = expected_checksums[i];

        let calculated = if checksum_bits == 8 {
            crc8_parameterised(payload, polynomial as u8, init as u8, xor_out as u8, reflect) as u16
        } else {
            crc16_parameterised(payload, polynomial, init, xor_out, reflect, reflect)
        };

        if calculated == expected {
            match_count += 1;
        }
    }

    BatchDiscoveryResult {
        match_count,
        total_count,
    }
}

// ============================================================================
// Candidate Sweep
// ============================================================================

/// One point in the checksum candidate space: where the checksum sits, how it is
/// read, and which bytes it is calculated over.
///
/// Both the unit the sweep iterates and the wire type for the single-spec live
/// check the dialog runs behind a hand-edited configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumSpec {
    pub algorithm: ChecksumAlgorithm,
    /// Byte offset of the checksum; negative counts from the end.
    pub position: i32,
    pub byte_length: usize,
    pub big_endian: bool,
    pub calc_start_byte: i32,
    pub calc_end_byte: i32,
}

/// How one spec fared across the sampled frames.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumSpecResult {
    /// Index into the `specs` array the caller passed in.
    pub spec_index: usize,
    pub match_count: usize,
    /// Frames the spec actually fitted — frames too short for it are excluded
    /// rather than counted as misses.
    pub total_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumSweepResponse {
    pub results: Vec<ChecksumSpecResult>,
}

/// Run many checksum configurations against many frames.
///
/// Specs sharing an `(algorithm, calc_start_byte, calc_end_byte)` key are grouped
/// so the underlying CRC runs once per group per frame rather than once per spec —
/// the two endiannesses of a CRC-16, for instance, differ only in how the stored
/// value is read, never in what is calculated.
fn sweep_specs(frames: &[Vec<u8>], specs: &[ChecksumSpec]) -> Vec<ChecksumSpecResult> {
    let mut groups: HashMap<(ChecksumAlgorithm, i32, i32), Vec<usize>> = HashMap::new();
    for (idx, spec) in specs.iter().enumerate() {
        groups
            .entry((spec.algorithm, spec.calc_start_byte, spec.calc_end_byte))
            .or_default()
            .push(idx);
    }

    let mut results: Vec<ChecksumSpecResult> = Vec::new();

    for ((algorithm, calc_start, calc_end), members) in &groups {
        // Calculated value per frame, once for the whole group. `None` where the
        // range is degenerate for that frame.
        let calculated: Vec<Option<u16>> = frames
            .iter()
            .map(|frame| {
                let len = frame.len();
                let start = resolve_byte_index(*calc_start, len).min(len);
                let end = resolve_byte_index(*calc_end, len).min(len);
                (start < end).then(|| calculate_checksum_simple(*algorithm, &frame[start..end]))
            })
            .collect();

        for &idx in members {
            let spec = &specs[idx];
            let mut match_count = 0usize;
            let mut total_count = 0usize;

            for (frame, calc) in frames.iter().zip(&calculated) {
                let Some(calc) = calc else { continue };
                let len = frame.len();
                if resolve_byte_index(spec.position, len) + spec.byte_length > len {
                    continue;
                }
                total_count += 1;
                let extracted =
                    extract_checksum(frame, spec.position, spec.byte_length, spec.big_endian);
                if extracted == *calc {
                    match_count += 1;
                }
            }

            if total_count > 0 {
                results.push(ChecksumSpecResult {
                    spec_index: idx,
                    match_count,
                    total_count,
                });
            }
        }
    }

    results.sort_by_key(|r| r.spec_index);
    results
}

// ============================================================================
// Checksum Detection
// ============================================================================
//
// The counterpart to the frontend's framing detection: sweep a candidate space,
// score each candidate with a composite confidence, return them ranked with
// notes explaining the verdict.
//
// This lives beside the algorithms rather than in TypeScript so there is exactly
// one implementation of each — an earlier split put the scoring on the far side
// of the IPC boundary and needed a hand-maintained TS copy of all eleven
// algorithms just to test it.
//
// Notes cross the boundary as a code plus interpolation values, so the prose
// stays translatable on the frontend instead of shipping English from Rust.

/// How many end-relative byte columns to profile, at minimum. The priors have to
/// reach every position being swept — a candidate past the profiled depth would
/// silently skip the constant-column rejection the whole design rests on.
const MIN_TAIL_DEPTH: i32 = 4;

/// Below this many samples, a constant column is not yet evidence of padding.
const CONSTANT_COLUMN_MIN_SAMPLES: usize = 8;

/// Cap on the returned candidate list.
const MAX_CANDIDATES: usize = 12;

/// Frames sampled for detection. The dialog reads the same number from the
/// capture, so both halves measure against one set.
const MAX_SAMPLES: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChecksumDetectionOptions {
    /// Checksum offsets to try, end-relative.
    pub positions: Vec<i32>,
    /// Restrict to checksums of these byte lengths. Empty means both.
    pub lengths: Vec<usize>,
    /// Byte offsets just past a declared header field, from the view's ID/Source
    /// chips. These widen the calculation-range candidates and earn a small
    /// confidence bonus; they never narrow the search.
    pub header_boundaries: Vec<i32>,
    /// Percentage below which a candidate is discarded.
    pub min_match_rate: f64,
    /// Confidence below which a candidate is discarded.
    pub min_confidence: u8,
}

impl Default for ChecksumDetectionOptions {
    fn default() -> Self {
        Self {
            positions: vec![-1, -2, -3],
            lengths: Vec::new(),
            header_boundaries: Vec::new(),
            min_match_rate: 50.0,
            min_confidence: 35,
        }
    }
}

/// A translatable note: the frontend renders `t(code, values)`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumNote {
    pub code: String,
    pub values: serde_json::Map<String, serde_json::Value>,
}

impl ChecksumNote {
    fn new(code: &str, values: &[(&str, serde_json::Value)]) -> Self {
        Self {
            code: code.to_string(),
            values: values
                .iter()
                .map(|(k, v)| ((*k).to_string(), v.clone()))
                .collect(),
        }
    }

}

/// What one end-relative byte column looks like across the sample. This is the
/// structural evidence behind the priors: a column that never changes cannot be
/// a checksum, and one that takes many values probably is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumColumnStat {
    /// Negative index, e.g. -1 for the last byte.
    pub position: i32,
    pub distinct_values: usize,
    /// Set when the column holds one value across every sampled frame.
    pub constant_value: Option<u8>,
    pub sample_count: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcRange {
    pub calc_start_byte: i32,
    pub calc_end_byte: i32,
}

/// A checksum configuration that reproduces some or all of the sampled frames.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumCandidate {
    pub algorithm: ChecksumAlgorithm,
    pub position: i32,
    pub length: usize,
    pub big_endian: bool,
    pub calc_start_byte: i32,
    pub calc_end_byte: i32,
    pub match_count: usize,
    pub total_count: usize,
    /// 0-100
    pub match_rate: f64,
    /// 0-100 composite score.
    pub confidence: u8,
    pub notes: Vec<ChecksumNote>,
    /// Other calculation ranges that scored identically. Kept rather than
    /// dropped, so a user who disagrees with the winner can see the alternatives.
    pub equivalent_ranges: Vec<CalcRange>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumDetectionResult {
    pub candidates: Vec<ChecksumCandidate>,
    pub best_candidate: Option<ChecksumCandidate>,
    pub tail_columns: Vec<ChecksumColumnStat>,
    /// Result-level explanation, including why nothing was found.
    pub notes: Vec<ChecksumNote>,
}

/// Profile the last `depth` byte columns (at least `MIN_TAIL_DEPTH`), end-relative
/// so frames of different lengths line up. Frames too short for a column do not
/// contribute.
pub fn analyse_tail_columns(frames: &[Vec<u8>], depth: i32) -> Vec<ChecksumColumnStat> {
    (1..=depth.max(MIN_TAIL_DEPTH))
        .filter_map(|k| {
            let mut values = BTreeSet::new();
            let mut sample_count = 0usize;
            for frame in frames {
                if frame.len() < k as usize {
                    continue;
                }
                values.insert(frame[frame.len() - k as usize]);
                sample_count += 1;
            }
            (sample_count > 0).then(|| ChecksumColumnStat {
                position: -k,
                distinct_values: values.len(),
                constant_value: (values.len() == 1).then(|| *values.iter().next().unwrap()),
                sample_count,
            })
        })
        .collect()
}

fn column_at(columns: &[ChecksumColumnStat], position: i32) -> Option<&ChecksumColumnStat> {
    columns.iter().find(|c| c.position == position)
}

/// Number of constant columns sitting immediately before `position`.
fn constant_run_before(position: i32, columns: &[ChecksumColumnStat]) -> i32 {
    let mut run = 0;
    let mut p = position - 1;
    while let Some(column) = column_at(columns, p) {
        if column.constant_value.is_none() {
            break;
        }
        run += 1;
        p -= 1;
    }
    run
}

/// Enumerate the configurations worth testing.
///
/// Length is not a free axis — the algorithm fixes it — so the space is
/// (algorithm × position) × calcStart × calcEnd × endianness, which stays in the
/// low hundreds rather than the thousands.
pub fn build_checksum_specs(
    frames: &[Vec<u8>],
    options: &ChecksumDetectionOptions,
    columns: &[ChecksumColumnStat],
) -> Vec<ChecksumSpec> {
    // The longest frame, not the shortest. Feasibility here asks "can any frame
    // carry this configuration", because `sweep_specs` already excludes the
    // frames that individually cannot. Asking it of the shortest frame instead
    // lets one runt — a bare one-byte acknowledgement sharing the link — empty
    // the entire search space.
    let max_length = frames.iter().map(|f| f.len()).max().unwrap_or(0);

    // `1` is not arbitrary: a leading type/ID byte excluded from the calculation
    // is a common shape, and it is the one the declared-header hints cannot
    // supply when a field starts at byte 0. Starts that overrun the frame are
    // left to the degenerate-range check below rather than filtered here.
    let calc_starts: BTreeSet<i32> = [0, 1, 2]
        .iter()
        .chain(options.header_boundaries.iter())
        .copied()
        .filter(|s| *s >= 0)
        .collect();

    // Runs are per position, and every algorithm at a position shares them.
    let calc_ends: HashMap<i32, Vec<i32>> = options
        .positions
        .iter()
        .map(|p| {
            let run = constant_run_before(*p, columns);
            let ends: Vec<i32> = if run > 0 { vec![*p, *p - run] } else { vec![*p] };
            (*p, ends)
        })
        .collect();

    let mut specs = Vec::new();

    for algorithm in ALL_ALGORITHMS {
        let byte_length = algorithm.output_bytes();
        if !options.lengths.is_empty() && !options.lengths.contains(&byte_length) {
            continue;
        }
        // The checksum, plus at least one byte to calculate over, has to fit
        // inside a frame.
        if max_length < byte_length + 1 {
            continue;
        }
        // Endianness only means something for a multi-byte checksum.
        let endiannesses: &[bool] = if byte_length == 2 {
            &[false, true]
        } else {
            &[true]
        };

        for position in &options.positions {
            // The checksum must not overrun the end of the frame.
            if position + byte_length as i32 > 0 {
                continue;
            }

            for calc_end_byte in &calc_ends[position] {
                for calc_start_byte in &calc_starts {
                    // Degenerate for every frame: an end-relative range is at
                    // its widest in the longest frame, so if even that one has
                    // nothing to calculate over, none of them do.
                    if resolve_byte_index(*calc_end_byte, max_length) <= *calc_start_byte as usize {
                        continue;
                    }
                    for big_endian in endiannesses {
                        specs.push(ChecksumSpec {
                            algorithm,
                            position: *position,
                            byte_length,
                            big_endian: *big_endian,
                            calc_start_byte: *calc_start_byte,
                            calc_end_byte: *calc_end_byte,
                        });
                    }
                }
            }
        }
    }

    specs
}

struct ScoringContext<'a> {
    columns: &'a [ChecksumColumnStat],
    header_boundaries: &'a [i32],
    frames: &'a [Vec<u8>],
}

/// The narrowest range this configuration ever actually calculates over, across
/// the frames it fits. Frames it does not fit are excluded here for the same
/// reason `sweep_specs` excludes them: they are not evidence about this spec.
fn narrowest_calc_span(spec: &ChecksumSpec, frames: &[Vec<u8>]) -> usize {
    frames
        .iter()
        .filter_map(|frame| {
            let len = frame.len();
            let start = resolve_byte_index(spec.calc_start_byte, len).min(len);
            let end = resolve_byte_index(spec.calc_end_byte, len).min(len);
            (start < end).then(|| end - start)
        })
        .min()
        .unwrap_or(0)
}

/// Score one swept configuration, or reject it.
///
/// Additive tiers plus corroboration bonuses and suspicion penalties. The
/// rejections matter as much as the score: an XOR or sum over an all-zero range
/// yields zero, which "matches" a constant 0x00 padding column perfectly and
/// would otherwise outrank the real answer.
fn score_candidate(
    spec: &ChecksumSpec,
    match_count: usize,
    total_count: usize,
    ctx: &ScoringContext,
) -> Option<ChecksumCandidate> {
    let match_rate = match_count as f64 / total_count as f64 * 100.0;
    let column = column_at(ctx.columns, spec.position);

    // A constant column is padding, not a checksum — however well it matches.
    if let Some(column) = column {
        if column.constant_value.is_some() && column.sample_count >= CONSTANT_COLUMN_MIN_SAMPLES {
            return None;
        }
    }

    let mut notes: Vec<ChecksumNote> = Vec::new();
    let mut score: i32 = 0;

    if match_rate >= 100.0 {
        score += 55;
        notes.push(ChecksumNote::new(
            "matchesAll",
            &[("count", total_count.into())],
        ));
    } else {
        score += if match_rate >= 99.0 {
            48
        } else if match_rate >= 95.0 {
            40
        } else if match_rate >= 80.0 {
            25
        } else {
            10
        };
        notes.push(ChecksumNote::new(
            "matchesSome",
            &[
                ("matched", match_count.into()),
                ("total", total_count.into()),
            ],
        ));
    }

    if total_count >= 200 {
        score += 20;
    } else if total_count >= 50 {
        score += 15;
    } else if total_count >= 20 {
        score += 10;
    } else if total_count >= 8 {
        score += 5;
    } else {
        notes.push(ChecksumNote::new(
            "fewSamples",
            &[("count", total_count.into())],
        ));
    }

    // A real checksum column varies. This is the same class of check as the
    // 0xC0-frequency test in the framing detector: cheap, structural, decisive.
    if let Some(column) = column {
        let span = column
            .sample_count
            .min(if spec.byte_length == 2 { 65536 } else { 256 });
        let distinct_ratio = column.distinct_values as f64 / span as f64;
        if distinct_ratio >= 0.5 {
            score += 15;
            notes.push(ChecksumNote::new(
                "columnVaries",
                &[
                    ("distinct", column.distinct_values.into()),
                    ("samples", column.sample_count.into()),
                ],
            ));
        } else if distinct_ratio >= 0.2 {
            score += 8;
        } else if distinct_ratio < 0.05 {
            score -= 30;
            notes.push(ChecksumNote::new(
                "columnNearlyConstant",
                &[("distinct", column.distinct_values.into())],
            ));
        }
    }

    if spec.calc_end_byte == spec.position {
        score += 10;
    }

    if ctx.header_boundaries.contains(&spec.calc_start_byte) {
        score += 5;
        notes.push(ChecksumNote::new(
            "startsAfterHeader",
            &[("byte", spec.calc_start_byte.into())],
        ));
    }

    if spec.calc_end_byte < spec.position {
        if let Some(value) = column_at(ctx.columns, spec.calc_end_byte).and_then(|c| c.constant_value)
        {
            score += 5;
            notes.push(ChecksumNote::new(
                "constantExcluded",
                &[("value", format!("0x{value:02X}").into())],
            ));
        }
    }

    // A short calculated range is matched by chance far too easily.
    if narrowest_calc_span(spec, ctx.frames) < 2 {
        score -= 15;
        notes.push(ChecksumNote::new("shortRange", &[]));
    }

    // A 2-byte column whose high byte never moves is really a 1-byte checksum.
    if spec.byte_length == 2 {
        let high = if spec.big_endian {
            spec.position
        } else {
            spec.position + 1
        };
        if column_at(ctx.columns, high).is_some_and(|c| c.constant_value.is_some()) {
            score -= 10;
            notes.push(ChecksumNote::new("highByteConstant", &[]));
        }
    }

    Some(ChecksumCandidate {
        algorithm: spec.algorithm,
        position: spec.position,
        length: spec.byte_length,
        big_endian: spec.big_endian,
        calc_start_byte: spec.calc_start_byte,
        calc_end_byte: spec.calc_end_byte,
        match_count,
        total_count,
        match_rate,
        confidence: score.clamp(0, 100) as u8,
        notes,
        equivalent_ranges: Vec::new(),
    })
}

fn algorithm_rank(algorithm: ChecksumAlgorithm) -> usize {
    ALL_ALGORITHMS
        .iter()
        .position(|a| *a == algorithm)
        .unwrap_or(ALL_ALGORITHMS.len())
}

/// Confidence, then match rate, then parsimony: simpler explanations first.
fn compare_candidates(a: &ChecksumCandidate, b: &ChecksumCandidate) -> std::cmp::Ordering {
    b.confidence
        .cmp(&a.confidence)
        .then_with(|| b.match_rate.total_cmp(&a.match_rate))
        .then_with(|| a.length.cmp(&b.length))
        .then_with(|| a.calc_start_byte.cmp(&b.calc_start_byte))
        .then_with(|| algorithm_rank(a.algorithm).cmp(&algorithm_rank(b.algorithm)))
}

/// Rank, then fold configurations that differ only in calculation range into the
/// winner's `equivalent_ranges`.
///
/// Keying on the algorithm as well as the geometry keeps genuinely different
/// explanations visible while still collapsing the noise.
fn collapse_equivalent(mut candidates: Vec<ChecksumCandidate>) -> Vec<ChecksumCandidate> {
    candidates.sort_by(compare_candidates);

    let mut kept: Vec<ChecksumCandidate> = Vec::new();
    for candidate in candidates {
        let key = |c: &ChecksumCandidate| (c.algorithm, c.position, c.length, c.big_endian);
        match kept.iter_mut().find(|k| key(k) == key(&candidate)) {
            Some(winner) => {
                if winner.match_rate == candidate.match_rate {
                    winner.equivalent_ranges.push(CalcRange {
                        calc_start_byte: candidate.calc_start_byte,
                        calc_end_byte: candidate.calc_end_byte,
                    });
                }
            }
            None => kept.push(candidate),
        }
    }
    kept
}

/// Say why the search came up empty. A silent 0% reads as "your data is wrong";
/// naming what was looked at and what the tail actually looks like points at the
/// next thing to try.
fn explain_no_candidates(last: &ChecksumColumnStat, frame_count: usize) -> ChecksumNote {
    match last.constant_value {
        Some(value) => ChecksumNote::new(
            "noneLastByteConstant",
            &[
                ("value", format!("0x{value:02X}").into()),
                ("frames", frame_count.into()),
            ],
        ),
        None => ChecksumNote::new(
            "noneButLastByteVaries",
            &[
                ("distinct", last.distinct_values.into()),
                ("frames", frame_count.into()),
            ],
        ),
    }
}

/// Find the checksum configurations that best explain a set of frames.
pub fn detect_checksum(
    frames: &[Vec<u8>],
    options: &ChecksumDetectionOptions,
) -> ChecksumDetectionResult {
    let samples: Vec<Vec<u8>> = frames
        .iter()
        .filter(|f| !f.is_empty())
        .take(MAX_SAMPLES)
        .cloned()
        .collect();

    if samples.is_empty() {
        return ChecksumDetectionResult {
            candidates: Vec::new(),
            best_candidate: None,
            tail_columns: Vec::new(),
            notes: vec![ChecksumNote::new("noFrames", &[])],
        };
    }

    let min_length = samples.iter().map(|f| f.len()).min().unwrap_or(0);
    let max_length = samples.iter().map(|f| f.len()).max().unwrap_or(0);
    // Profile at least as deep as the deepest position being swept.
    let depth = -options.positions.iter().copied().min().unwrap_or(-1);
    let tail_columns = analyse_tail_columns(&samples, depth);

    let mut notes = vec![ChecksumNote::new(
        "analysed",
        &[
            ("frames", samples.len().into()),
            ("minLength", min_length.into()),
            ("maxLength", max_length.into()),
        ],
    )];
    for column in &tail_columns {
        if let Some(value) = column.constant_value {
            if column.sample_count >= CONSTANT_COLUMN_MIN_SAMPLES {
                notes.push(ChecksumNote::new(
                    "constantPadding",
                    &[
                        ("position", column.position.into()),
                        ("value", format!("0x{value:02X}").into()),
                    ],
                ));
            }
        }
    }

    let specs = build_checksum_specs(&samples, options, &tail_columns);
    let results = sweep_specs(&samples, &specs);

    notes.push(ChecksumNote::new(
        "configurationsTested",
        &[
            ("specs", specs.len().into()),
            ("algorithms", ALL_ALGORITHMS.len().into()),
        ],
    ));

    let ctx = ScoringContext {
        columns: &tail_columns,
        header_boundaries: &options.header_boundaries,
        frames: &samples,
    };

    let scored: Vec<ChecksumCandidate> = results
        .iter()
        .filter(|r| r.match_count as f64 / r.total_count as f64 * 100.0 >= options.min_match_rate)
        .filter_map(|r| score_candidate(&specs[r.spec_index], r.match_count, r.total_count, &ctx))
        .collect();

    let mut candidates = collapse_equivalent(scored);
    candidates.retain(|c| c.confidence >= options.min_confidence);
    candidates.truncate(MAX_CANDIDATES);

    // Non-empty samples always yield a -1 column, so there is always something to
    // say about the byte a checksum would most likely occupy.
    if let (true, Some(last)) = (candidates.is_empty(), column_at(&tail_columns, -1)) {
        notes.push(explain_no_candidates(last, samples.len()));
    }

    ChecksumDetectionResult {
        best_candidate: candidates.first().cloned(),
        candidates,
        tail_columns,
        notes,
    }
}

// ============================================================================
// Detection Commands
// ============================================================================

/// Rank the checksum configurations that explain a set of frames.
#[tauri::command]
pub fn detect_checksum_cmd(
    frames: Vec<Vec<u8>>,
    options: Option<ChecksumDetectionOptions>,
) -> ChecksumDetectionResult {
    detect_checksum(&frames, &options.unwrap_or_default())
}

/// Check specific checksum configurations against frames.
///
/// Used for the live match rate behind a hand-edited configuration, where the
/// caller has one spec rather than a space to search.
///
/// Worth absorbing eventually: `batch_test_crc_cmd` answers the same question for
/// a parameterised polynomial, and a `ChecksumSpec` variant carrying poly/init/
/// xor-out/reflect would let the CRC brute force run as one sweep instead of tens
/// of thousands of IPC calls.
#[tauri::command]
pub fn sweep_checksum_specs_cmd(
    frames: Vec<Vec<u8>>,
    specs: Vec<ChecksumSpec>,
) -> ChecksumSweepResponse {
    ChecksumSweepResponse {
        results: sweep_specs(&frames, &specs),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // Byte Index Resolution Tests
    // ========================================================================

    #[test]
    fn test_resolve_byte_index_positive() {
        assert_eq!(resolve_byte_index(0, 10), 0);
        assert_eq!(resolve_byte_index(5, 10), 5);
        assert_eq!(resolve_byte_index(9, 10), 9);
    }

    #[test]
    fn test_resolve_byte_index_negative() {
        assert_eq!(resolve_byte_index(-1, 10), 9); // last byte
        assert_eq!(resolve_byte_index(-2, 10), 8); // second-to-last
        assert_eq!(resolve_byte_index(-10, 10), 0); // first byte
    }

    #[test]
    fn test_resolve_byte_index_clamps_overly_negative() {
        assert_eq!(resolve_byte_index(-11, 10), 0);
        assert_eq!(resolve_byte_index(-100, 10), 0);
    }

    // ========================================================================
    // XOR Checksum Tests
    // ========================================================================

    #[test]
    fn test_xor_checksum_basic() {
        // 0x01 ^ 0x02 ^ 0x03 ^ 0x04 ^ 0x05 = 0x01
        assert_eq!(xor_checksum(&[0x01, 0x02, 0x03, 0x04, 0x05]), 0x01);
    }

    #[test]
    fn test_xor_checksum_pairs() {
        assert_eq!(xor_checksum(&[0x01, 0x02, 0x03]), 0x00);
        assert_eq!(xor_checksum(&[0xFF, 0xFF]), 0x00);
        assert_eq!(xor_checksum(&[0xAA, 0x55]), 0xFF);
    }

    #[test]
    fn test_xor_checksum_empty() {
        assert_eq!(xor_checksum(&[]), 0);
    }

    #[test]
    fn test_xor_checksum_single_byte() {
        assert_eq!(xor_checksum(&[0x42]), 0x42);
    }

    // ========================================================================
    // Sum8 Checksum Tests
    // ========================================================================

    #[test]
    fn test_sum8_checksum_basic() {
        // 0x01 + 0x02 + 0x03 + 0x04 + 0x05 = 0x0F
        assert_eq!(sum8_checksum(&[0x01, 0x02, 0x03, 0x04, 0x05]), 0x0F);
    }

    #[test]
    fn test_sum8_checksum_simple() {
        assert_eq!(sum8_checksum(&[0x01, 0x02, 0x03]), 0x06);
    }

    #[test]
    fn test_sum8_checksum_wrapping() {
        // 0xFF + 0x02 = 0x101, wraps to 0x01
        assert_eq!(sum8_checksum(&[0xFF, 0x02]), 0x01);
        // 0x80 + 0x80 = 0x100, wraps to 0x00
        assert_eq!(sum8_checksum(&[0x80, 0x80]), 0x00);
    }

    #[test]
    fn test_sum8_checksum_empty() {
        assert_eq!(sum8_checksum(&[]), 0);
    }

    // ========================================================================
    // CRC-8 Tests
    // ========================================================================

    #[test]
    fn test_crc8_checksum_test_vector() {
        // Known test vector: "123456789" -> 0xF4
        let data = b"123456789";
        assert_eq!(crc8_checksum(data), 0xF4);
    }

    #[test]
    fn test_crc8_checksum_empty() {
        assert_eq!(crc8_checksum(&[]), 0);
    }

    // ========================================================================
    // CRC-8 SAE-J1850 Tests
    // ========================================================================

    #[test]
    fn test_crc8_sae_j1850_test_vector() {
        // Known test vector from CRC catalogue: "123456789" -> 0x4B
        let data = b"123456789";
        assert_eq!(crc8_sae_j1850_checksum(data), 0x4B);
    }

    #[test]
    fn test_crc8_sae_j1850_empty() {
        // Init 0xFF XOR xorout 0xFF = 0x00
        assert_eq!(crc8_sae_j1850_checksum(&[]), 0x00);
    }

    // ========================================================================
    // CRC-8 AUTOSAR Tests
    // ========================================================================

    #[test]
    fn test_crc8_autosar_test_vector() {
        // Known test vector from CRC catalogue: "123456789" -> 0xDF
        let data = b"123456789";
        assert_eq!(crc8_autosar_checksum(data), 0xDF);
    }

    #[test]
    fn test_crc8_autosar_empty() {
        // Init 0xFF XOR xorout 0xFF = 0x00
        assert_eq!(crc8_autosar_checksum(&[]), 0x00);
    }

    // ========================================================================
    // CRC-8 Maxim Tests
    // ========================================================================

    #[test]
    fn test_crc8_maxim_test_vector() {
        // Known test vector from CRC catalogue: "123456789" -> 0xA1
        let data = b"123456789";
        assert_eq!(crc8_maxim_checksum(data), 0xA1);
    }

    #[test]
    fn test_crc8_maxim_empty() {
        assert_eq!(crc8_maxim_checksum(&[]), 0x00);
    }

    // ========================================================================
    // CRC-8 CDMA2000 Tests
    // ========================================================================

    #[test]
    fn test_crc8_cdma2000_test_vector() {
        // Known test vector from CRC catalogue: "123456789" -> 0xDA
        let data = b"123456789";
        assert_eq!(crc8_cdma2000_checksum(data), 0xDA);
    }

    #[test]
    fn test_crc8_cdma2000_empty() {
        // Init 0xFF, no xorout
        assert_eq!(crc8_cdma2000_checksum(&[]), 0xFF);
    }

    // ========================================================================
    // CRC-8 DVB-S2 Tests
    // ========================================================================

    #[test]
    fn test_crc8_dvb_s2_test_vector() {
        // Known test vector from CRC catalogue: "123456789" -> 0xBC
        let data = b"123456789";
        assert_eq!(crc8_dvb_s2_checksum(data), 0xBC);
    }

    #[test]
    fn test_crc8_dvb_s2_empty() {
        assert_eq!(crc8_dvb_s2_checksum(&[]), 0x00);
    }

    // ========================================================================
    // CRC-8 Nissan Tests
    // ========================================================================

    #[test]
    fn test_crc8_nissan_sample_message() {
        // Sample from Nissan LEAF code: {0x6E, 0x0F, 0x0F, 0xFD, 0x08, 0xC0, 0xC3}
        // This produces a checksum that can be verified against actual Nissan CAN data
        let data = [0x6E, 0x0F, 0x0F, 0xFD, 0x08, 0xC0, 0xC3];
        assert_eq!(crc8_nissan_checksum(&data), 0x3E);
    }

    #[test]
    fn test_crc8_nissan_empty() {
        assert_eq!(crc8_nissan_checksum(&[]), 0x00);
    }

    #[test]
    fn test_crc8_nissan_basic() {
        assert_eq!(crc8_nissan_checksum(&[0x01, 0x02, 0x03]), 0x5A);
    }

    // ========================================================================
    // CRC-16 Modbus Tests
    // ========================================================================

    #[test]
    fn test_crc16_modbus_checksum_test_vector() {
        // Known Modbus test vector: device address 0x01, function 0x03, data
        // [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A] -> 0xCDC5
        // (Wire format would be C5 CD in little-endian)
        let data = [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A];
        assert_eq!(crc16_modbus_checksum(&data), 0xCDC5);
    }

    #[test]
    fn test_crc16_modbus_checksum_empty() {
        // Initial value for Modbus CRC is 0xFFFF
        assert_eq!(crc16_modbus_checksum(&[]), 0xFFFF);
    }

    // ========================================================================
    // CRC-16 CCITT Tests
    // ========================================================================

    #[test]
    fn test_crc16_ccitt_checksum_test_vector() {
        // Known CCITT test vector: "123456789" -> 0x29B1
        let data = b"123456789";
        assert_eq!(crc16_ccitt_checksum(data), 0x29B1);
    }

    #[test]
    fn test_crc16_ccitt_checksum_empty() {
        // Initial value for CCITT CRC is 0xFFFF
        assert_eq!(crc16_ccitt_checksum(&[]), 0xFFFF);
    }

    // ========================================================================
    // Calculate Checksum Simple Tests
    // ========================================================================

    #[test]
    fn test_calculate_checksum_simple_all_algorithms() {
        let data = [0x01, 0x02, 0x03];
        assert_eq!(calculate_checksum_simple(ChecksumAlgorithm::Xor, &data), 0x00);
        assert_eq!(calculate_checksum_simple(ChecksumAlgorithm::Sum8, &data), 0x06);
        assert_eq!(calculate_checksum_simple(ChecksumAlgorithm::Crc8, &data), 0x48);
        assert_eq!(calculate_checksum_simple(ChecksumAlgorithm::Crc16Modbus, &data), 0x6161);
        assert_eq!(calculate_checksum_simple(ChecksumAlgorithm::Crc16Ccitt, &data), 0xADAD);
    }

    // ========================================================================
    // Calculate Checksum with Range Tests
    // ========================================================================

    #[test]
    fn test_calculate_checksum_with_range() {
        // Frame: [header, data1, data2, data3, checksum_placeholder]
        let frame = [0x55u8, 0x01, 0x02, 0x03, 0x00];

        // Calculate over bytes 1-4 (data only, excluding header at 0)
        let checksum = calculate_checksum(ChecksumAlgorithm::Sum8, &frame, 1, 4);
        assert_eq!(checksum, 0x06); // 0x01 + 0x02 + 0x03
    }

    #[test]
    fn test_calculate_checksum_with_negative_indices() {
        // Frame: [header, data1, data2, data3, checksum_placeholder]
        let frame = [0x55u8, 0x01, 0x02, 0x03, 0x00];

        // Calculate from start to -1 (exclude last byte)
        let checksum = calculate_checksum(ChecksumAlgorithm::Sum8, &frame, 0, -1);
        assert_eq!(checksum, 0x5B); // 0x55 + 0x01 + 0x02 + 0x03
    }

    // ========================================================================
    // Extract Checksum Tests
    // ========================================================================

    #[test]
    fn test_extract_checksum_single_byte() {
        let data = [0x01, 0x02, 0x03, 0xAB];
        assert_eq!(extract_checksum(&data, 3, 1, true), 0xAB);
        assert_eq!(extract_checksum(&data, -1, 1, true), 0xAB); // negative index
    }

    #[test]
    fn test_extract_checksum_single_byte_negative_index() {
        let frame = [0x01, 0x02, 0x03, 0xAB, 0xCD];
        assert_eq!(extract_checksum(&frame, -2, 1, true), 0xAB);
    }

    #[test]
    fn test_extract_checksum_two_bytes_big_endian() {
        let data = [0x01, 0x02, 0xAB, 0xCD];
        // Big-endian: 0xABCD
        assert_eq!(extract_checksum(&data, 2, 2, true), 0xABCD);
        assert_eq!(extract_checksum(&data, -2, 2, true), 0xABCD);
    }

    #[test]
    fn test_extract_checksum_two_bytes_little_endian() {
        let data = [0x01, 0x02, 0xAB, 0xCD];
        // Little-endian: 0xCDAB
        assert_eq!(extract_checksum(&data, 2, 2, false), 0xCDAB);
        assert_eq!(extract_checksum(&data, -2, 2, false), 0xCDAB);
    }

    // ========================================================================
    // Validate Checksum Tests
    // ========================================================================

    #[test]
    fn test_validate_checksum_xor_valid() {
        // Create frame with XOR checksum at end
        // data = [0x01, 0x02], XOR = 0x03, so frame = [0x01, 0x02, 0x03]
        let data = [0x01, 0x02, 0x03];
        let result = validate_checksum(
            ChecksumAlgorithm::Xor,
            &data,
            2,     // checksum at byte 2
            1,     // 1 byte
            true,  // endianness (doesn't matter for 1 byte)
            0,     // calc from byte 0
            2,     // to byte 2 (exclusive)
        );
        assert_eq!(result.extracted, 0x03);
        assert_eq!(result.calculated, 0x03); // XOR of 0x01, 0x02
        assert!(result.valid);
    }

    #[test]
    fn test_validate_checksum_sum8_valid() {
        // Build frame with known checksum
        let data = [0x01u8, 0x02, 0x03];
        let checksum = sum8_checksum(&data); // 0x06
        let mut frame = Vec::from(data);
        frame.push(checksum);

        let result = validate_checksum(
            ChecksumAlgorithm::Sum8,
            &frame,
            -1,    // checksum at last byte
            1,     // 1 byte
            true,  // big-endian
            0,     // calc from byte 0
            -1,    // to last byte (exclusive of checksum)
        );
        assert!(result.valid);
        assert_eq!(result.extracted, 0x06);
        assert_eq!(result.calculated, 0x06);
    }

    #[test]
    fn test_validate_checksum_invalid() {
        let data = [0x01, 0x02, 0x03];
        let frame = [data[0], data[1], data[2], 0xFF]; // Wrong checksum

        let result = validate_checksum(
            ChecksumAlgorithm::Sum8,
            &frame,
            -1,    // checksum at last byte
            1,     // 1 byte
            true,  // big-endian
            0,     // calc from byte 0
            -1,    // to last byte (exclusive of checksum)
        );
        assert!(!result.valid);
        assert_eq!(result.extracted, 0xFF);
        assert_eq!(result.calculated, 0x06);
    }

    #[test]
    fn test_validate_checksum_crc16_modbus_valid() {
        // Known Modbus frame
        let data = [0x01u8, 0x03, 0x00, 0x00, 0x00, 0x0A];
        let crc = crc16_modbus_checksum(&data); // 0xCDC5
        // Append CRC in little-endian (Modbus wire format: low byte first)
        let mut frame = Vec::from(data);
        frame.push((crc & 0xFF) as u8);
        frame.push(((crc >> 8) & 0xFF) as u8);

        let result = validate_checksum(
            ChecksumAlgorithm::Crc16Modbus,
            &frame,
            -2,    // checksum at last 2 bytes
            2,     // 2 bytes
            false, // little-endian
            0,     // calc from byte 0
            -2,    // to -2 (exclusive of checksum)
        );
        assert!(result.valid);
        assert_eq!(result.extracted, 0xCDC5);
        assert_eq!(result.calculated, 0xCDC5);
    }

    // ========================================================================
    // Algorithm Parsing Tests
    // ========================================================================

    #[test]
    fn test_algorithm_from_str() {
        assert_eq!(ChecksumAlgorithm::from_str("xor").unwrap(), ChecksumAlgorithm::Xor);
        assert_eq!(ChecksumAlgorithm::from_str("sum8").unwrap(), ChecksumAlgorithm::Sum8);
        assert_eq!(ChecksumAlgorithm::from_str("crc8").unwrap(), ChecksumAlgorithm::Crc8);
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_sae_j1850").unwrap(),
            ChecksumAlgorithm::Crc8SaeJ1850
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_autosar").unwrap(),
            ChecksumAlgorithm::Crc8Autosar
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_maxim").unwrap(),
            ChecksumAlgorithm::Crc8Maxim
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_cdma2000").unwrap(),
            ChecksumAlgorithm::Crc8Cdma2000
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_dvb_s2").unwrap(),
            ChecksumAlgorithm::Crc8DvbS2
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc8_nissan").unwrap(),
            ChecksumAlgorithm::Crc8Nissan
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc16_modbus").unwrap(),
            ChecksumAlgorithm::Crc16Modbus
        );
        assert_eq!(
            ChecksumAlgorithm::from_str("crc16_ccitt").unwrap(),
            ChecksumAlgorithm::Crc16Ccitt
        );
    }

    #[test]
    fn test_algorithm_from_str_unknown() {
        assert!(ChecksumAlgorithm::from_str("unknown").is_err());
        assert!(ChecksumAlgorithm::from_str("").is_err());
    }

    // ========================================================================
    // Algorithm Output Bytes Tests
    // ========================================================================

    #[test]
    fn test_algorithm_output_bytes() {
        assert_eq!(ChecksumAlgorithm::Xor.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Sum8.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8SaeJ1850.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8Autosar.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8Maxim.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8Cdma2000.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8DvbS2.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc8Nissan.output_bytes(), 1);
        assert_eq!(ChecksumAlgorithm::Crc16Modbus.output_bytes(), 2);
        assert_eq!(ChecksumAlgorithm::Crc16Ccitt.output_bytes(), 2);
    }
    // ========================================================================
    // Checksum Detection Tests
    // ========================================================================

    fn spec(
        algorithm: ChecksumAlgorithm,
        position: i32,
        byte_length: usize,
        big_endian: bool,
        calc_start_byte: i32,
        calc_end_byte: i32,
    ) -> ChecksumSpec {
        ChecksumSpec {
            algorithm,
            position,
            byte_length,
            big_endian,
            calc_start_byte,
            calc_end_byte,
        }
    }

    /// Five frames captured from a real SLIP serial source. The checksum is a
    /// sum of every byte after the leading type byte — note frames 4 and 5 are
    /// permutations of each other differing only at byte 0, and share a checksum.
    /// Byte -2 is constant 0x00 padding.
    fn real_serial_frames() -> Vec<Vec<u8>> {
        vec![
            vec![
                0xFD, 0xE0, 0x55, 0x23, 0xF0, 0x0D, 0x03, 0x05, 0xDC, 0, 0, 0, 0, 0, 0x00, 0x39,
            ],
            vec![
                0xFB, 0xEB, 0xF0, 0x0D, 0x55, 0x23, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x60,
            ],
            vec![
                0xFD, 0xEB, 0x55, 0x23, 0x00, 0x6C, 0x03, 0xCF, 0x00, 0xF4, 0, 0, 0, 0, 0, 0, 0,
                0, 0x00, 0x95,
            ],
            vec![
                0xFB, 0xE0, 0xF0, 0x0D, 0x60, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x9E,
            ],
            vec![
                0xFD, 0xE0, 0x60, 0x61, 0xF0, 0x0D, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x9E,
            ],
        ]
    }

    /// The reported capture as it actually arrives, rather than tidied up: the
    /// same link carries bare one-byte acknowledgements, which are too short to
    /// hold a checksum at all. The payload frames still sum bytes 1.. into the
    /// last byte — 0xF1+0xF0+0x0D+0x55+0x23 is 0x66, and the third frame's
    /// bytes happen to sum to 0x00.
    fn real_serial_frames_with_acks() -> Vec<Vec<u8>> {
        [
            vec![
                0xFBu8, 0xF1, 0xF0, 0x0D, 0x55, 0x23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x66,
            ],
            vec![0xFC],
            vec![
                0xFD, 0xF1, 0x55, 0x23, 0x30, 0x31, 0x36, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00,
            ],
            vec![0xF8],
            vec![
                0xFB, 0xE0, 0xF0, 0x0D, 0x60, 0x61, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x9E,
            ],
        ]
        .into_iter()
        .cycle()
        .take(120)
        .collect()
    }

    /// Repeated so the sample-count tiers behave as they would on a live capture.
    fn many_real_frames() -> Vec<Vec<u8>> {
        real_serial_frames()
            .into_iter()
            .cycle()
            .take(100)
            .collect()
    }

    fn modbus_frames() -> Vec<Vec<u8>> {
        [
            vec![0x01u8, 0x03, 0x00, 0x00, 0x00, 0x0A],
            vec![0x01, 0x03, 0x00, 0x10, 0x00, 0x02],
            vec![0x02, 0x04, 0x00, 0x64, 0x00, 0x08],
            vec![0x03, 0x06, 0x00, 0x01, 0x12, 0x34],
            vec![0x01, 0x10, 0x00, 0x20, 0x00, 0x01],
        ]
        .into_iter()
        .cycle()
        .take(60)
        .map(|mut body| {
            let crc = crc16_modbus_checksum(&body);
            body.push((crc & 0xFF) as u8);
            body.push((crc >> 8) as u8);
            body
        })
        .collect()
    }

    /// Default profiling depth, matching what `detect_checksum` uses for the
    /// default positions.
    fn tail_columns(frames: &[Vec<u8>]) -> Vec<ChecksumColumnStat> {
        analyse_tail_columns(frames, MIN_TAIL_DEPTH)
    }

    fn note_codes(notes: &[ChecksumNote]) -> Vec<&str> {
        notes.iter().map(|n| n.code.as_str()).collect()
    }

    // ---- The reported bug -------------------------------------------------

    #[test]
    fn test_detect_finds_sum8_over_the_real_capture() {
        // The dialog used to seed CRC-16 Modbus at -2 and report 0/20 here.
        let result = detect_checksum(&many_real_frames(), &Default::default());
        let best = result.best_candidate.expect("a candidate");

        assert_eq!(best.algorithm, ChecksumAlgorithm::Sum8);
        assert_eq!(best.position, -1);
        assert_eq!(best.length, 1);
        assert_eq!(best.calc_start_byte, 1);
        assert_eq!(best.calc_end_byte, -1);
        assert_eq!(best.match_rate, 100.0);
    }

    #[test]
    fn test_detect_finds_sum8_despite_one_byte_acknowledgements() {
        // The shortest frame on the link must not gate the search: a bare ACK
        // cannot hold a checksum, and the frames that can still deserve one.
        let frames = real_serial_frames_with_acks();
        let specs = build_checksum_specs(&frames, &Default::default(), &tail_columns(&frames));
        assert!(!specs.is_empty(), "the ACKs emptied the search space");

        let best = detect_checksum(&frames, &Default::default())
            .best_candidate
            .expect("a candidate");
        assert_eq!(best.algorithm, ChecksumAlgorithm::Sum8);
        assert_eq!(best.position, -1);
        assert_eq!(best.calc_start_byte, 1);
        assert_eq!(best.calc_end_byte, -1);
        assert_eq!(best.match_rate, 100.0);
        // The acknowledgements are excluded from the denominator, not counted
        // as misses against a checksum they were never going to carry.
        assert_eq!(best.total_count, 72);
    }

    #[test]
    fn test_detect_reports_the_constant_padding_byte() {
        let result = detect_checksum(&many_real_frames(), &Default::default());

        let minus_two = result
            .tail_columns
            .iter()
            .find(|c| c.position == -2)
            .unwrap();
        assert_eq!(minus_two.constant_value, Some(0x00));
        assert!(note_codes(&result.notes).contains(&"constantPadding"));
    }

    #[test]
    fn test_detect_ranks_a_coincidental_match_below_the_real_answer() {
        // XOR over the same range reproduces one frame in five by chance, which
        // is why a raw match count is not on its own evidence.
        let result = detect_checksum(&many_real_frames(), &Default::default());
        let best = result.best_candidate.clone().unwrap();

        assert_eq!(best.algorithm, ChecksumAlgorithm::Sum8);
        for candidate in &result.candidates {
            if candidate.algorithm == ChecksumAlgorithm::Xor {
                assert!(candidate.confidence < best.confidence);
            }
        }
    }

    // ---- Priors and rejections -------------------------------------------

    #[test]
    fn test_detect_rejects_a_constant_checksum_column() {
        // Every frame ends 0x00 and the body is all zeros, so XOR and sum both
        // "match" perfectly — but the column is padding, not a checksum.
        let frames: Vec<Vec<u8>> = (0..40u8).map(|i| vec![0x01, i, 0x00, 0x00, 0x00]).collect();
        let result = detect_checksum(&frames, &Default::default());
        assert!(result.candidates.iter().all(|c| c.position != -1));
    }

    #[test]
    fn test_detect_explains_itself_when_nothing_matches() {
        let frames: Vec<Vec<u8>> = (0..40u32)
            .map(|i| vec![0x10, 0x20, i as u8, (i * 37 + 11) as u8])
            .collect();
        let result = detect_checksum(&frames, &Default::default());

        assert!(result.candidates.is_empty());
        assert!(note_codes(&result.notes).contains(&"noneButLastByteVaries"));
    }

    #[test]
    fn test_detect_says_so_when_there_are_no_frames() {
        let result = detect_checksum(&[], &Default::default());
        assert_eq!(note_codes(&result.notes), vec!["noFrames"]);
        assert!(result.best_candidate.is_none());
    }

    #[test]
    fn test_analyse_tail_columns_is_end_relative() {
        let columns = tail_columns(&real_serial_frames());

        let last = columns.iter().find(|c| c.position == -1).unwrap();
        assert_eq!(last.distinct_values, 4);
        assert_eq!(last.sample_count, 5);
        assert_eq!(
            columns
                .iter()
                .find(|c| c.position == -2)
                .unwrap()
                .constant_value,
            Some(0x00)
        );
    }

    #[test]
    fn test_analyse_tail_columns_skips_frames_too_short() {
        let columns = tail_columns(&[vec![1, 2, 3, 4], vec![9]]);
        assert_eq!(
            columns
                .iter()
                .find(|c| c.position == -1)
                .unwrap()
                .sample_count,
            2
        );
        assert_eq!(
            columns
                .iter()
                .find(|c| c.position == -4)
                .unwrap()
                .sample_count,
            1
        );
    }

    // ---- Candidate space --------------------------------------------------

    #[test]
    fn test_build_specs_includes_the_configuration_the_old_sweep_could_not_express() {
        let frames = real_serial_frames();
        let options = ChecksumDetectionOptions::default();
        let specs = build_checksum_specs(&frames, &options, &tail_columns(&frames));

        assert!(specs.iter().any(|s| s.algorithm == ChecksumAlgorithm::Sum8
            && s.position == -1
            && s.calc_start_byte == 1
            && s.calc_end_byte == -1));
    }

    #[test]
    fn test_build_specs_tries_both_endiannesses_only_for_two_byte_algorithms() {
        let frames = real_serial_frames();
        let options = ChecksumDetectionOptions::default();
        let specs = build_checksum_specs(&frames, &options, &tail_columns(&frames));

        let crc16: BTreeSet<bool> = specs
            .iter()
            .filter(|s| s.algorithm == ChecksumAlgorithm::Crc16Modbus)
            .map(|s| s.big_endian)
            .collect();
        assert_eq!(crc16, BTreeSet::from([false, true]));

        let sum8: BTreeSet<bool> = specs
            .iter()
            .filter(|s| s.algorithm == ChecksumAlgorithm::Sum8)
            .map(|s| s.big_endian)
            .collect();
        assert_eq!(sum8, BTreeSet::from([true]));
    }

    #[test]
    fn test_build_specs_widens_with_header_hints_without_narrowing() {
        let frames = real_serial_frames();
        let options = ChecksumDetectionOptions {
            header_boundaries: vec![4],
            ..Default::default()
        };
        let specs = build_checksum_specs(&frames, &options, &tail_columns(&frames));

        assert!(specs.iter().any(|s| s.calc_start_byte == 4));
        // The real answer starts at byte 1, which is not a declared boundary —
        // hints must never replace the defaults.
        assert!(specs.iter().any(|s| s.calc_start_byte == 1));
    }

    #[test]
    fn test_build_specs_honours_a_length_restriction() {
        let frames = real_serial_frames();
        let options = ChecksumDetectionOptions {
            lengths: vec![1],
            ..Default::default()
        };
        let specs = build_checksum_specs(&frames, &options, &tail_columns(&frames));

        assert!(!specs.is_empty());
        assert!(specs.iter().all(|s| s.byte_length == 1));
    }

    #[test]
    fn test_build_specs_stays_within_a_sane_search_size() {
        let frames = real_serial_frames();
        let options = ChecksumDetectionOptions::default();
        let specs = build_checksum_specs(&frames, &options, &tail_columns(&frames));

        assert!(specs.len() > 50, "{} specs", specs.len());
        assert!(specs.len() < 400, "{} specs", specs.len());
    }

    // ---- Endianness, lengths, ranges --------------------------------------

    #[test]
    fn test_detect_distinguishes_a_little_endian_crc16() {
        // The TS sweep this replaced hardcoded big-endian, so a Modbus CRC was
        // undiscoverable on that path.
        let result = detect_checksum(&modbus_frames(), &Default::default());
        let best = result.best_candidate.expect("a candidate");

        assert_eq!(best.algorithm, ChecksumAlgorithm::Crc16Modbus);
        assert!(!best.big_endian);
        assert_eq!(best.position, -2);
        assert_eq!(best.length, 2);
        assert_eq!(best.match_rate, 100.0);
    }

    #[test]
    fn test_detect_keeps_an_equally_scoring_range_as_an_alternative() {
        // [1:-1] and [1:-2] both reproduce the frames, since byte -2 is zero.
        let result = detect_checksum(&many_real_frames(), &Default::default());
        let best = result.best_candidate.unwrap();

        assert_eq!(best.calc_end_byte, -1);
        assert!(!best.equivalent_ranges.is_empty());
    }

    #[test]
    fn test_detect_resolves_positions_across_mixed_frame_lengths() {
        // The fixture mixes 16- and 20-byte frames, so a candidate matching every
        // one of them proves the position resolved per frame, not per capture.
        let frames = many_real_frames();
        assert_eq!(frames.iter().map(|f| f.len()).min(), Some(16));
        assert_eq!(frames.iter().map(|f| f.len()).max(), Some(20));

        let result = detect_checksum(&frames, &Default::default());
        assert_eq!(result.best_candidate.unwrap().total_count, frames.len());
    }

    #[test]
    fn test_detect_caps_the_sample() {
        // 100 frames in, MAX_SAMPLES out — the dialog reads the same number from
        // the capture so both halves measure against one set.
        let many: Vec<Vec<u8>> = real_serial_frames().into_iter().cycle().take(600).collect();
        let result = detect_checksum(&many, &Default::default());
        assert_eq!(result.best_candidate.unwrap().total_count, MAX_SAMPLES);
    }

    // ---- The raw sweep ----------------------------------------------------

    #[test]
    fn test_sweep_excludes_frames_too_short_for_the_spec() {
        // A 2-byte checksum at -2 does not fit a 1-byte frame, so that frame is
        // excluded from the denominator rather than counted as a miss.
        let frames = vec![vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06], vec![0x07]];
        let out = sweep_checksum_specs_cmd(
            frames,
            vec![spec(ChecksumAlgorithm::Crc16Ccitt, -2, 2, true, 0, -2)],
        );

        assert_eq!(out.results.len(), 1);
        assert_eq!(out.results[0].total_count, 1);
    }

    #[test]
    fn test_sweep_excludes_frames_with_an_empty_calculation_range() {
        // resolve_byte_index saturates, so on a short frame calc_start can land
        // at or past calc_end. Those frames are skipped, not scored as misses.
        let frames = vec![vec![0x01, 0x02, 0x03, 0x04], vec![0x09]];
        let out =
            sweep_checksum_specs_cmd(frames, vec![spec(ChecksumAlgorithm::Sum8, -1, 1, true, 0, -1)]);

        assert_eq!(out.results.len(), 1);
        assert_eq!(out.results[0].total_count, 1);
    }

    #[test]
    fn test_sweep_reports_a_hand_typed_mismatch_rather_than_hiding_it() {
        // The dialog's live match rate goes through here, so a configuration the
        // user typed must come back as 0/N, not 0/0.
        let out = sweep_checksum_specs_cmd(
            real_serial_frames(),
            vec![spec(ChecksumAlgorithm::Crc16Modbus, -2, 2, false, 0, -2)],
        );

        assert_eq!(out.results[0].match_count, 0);
        assert_eq!(out.results[0].total_count, 5);
    }
}
