// ui/src-tauri/src/checksums.rs
//
// The frontend's door to `wiretap-checksum`. The algorithms, the candidate
// sweep, the scoring and the notes all live in the crate — a catalogue's
// checksum config is a catalogue concern, and keeping one implementation is
// what stopped the serial dialog and the Serial Payload tool disagreeing about
// the same bytes. What is left here is the Tauri surface: argument shapes,
// wire types, and the string-to-enum parse the frontend needs.

use serde::{Deserialize, Serialize};
use std::str::FromStr;

use wiretap_checksum::{
    calculate_checksum, crc16_parameterised, crc8_parameterised, detect_checksum,
    resolve_byte_index, sweep_specs, validate_checksum, ChecksumAlgorithm,
    ChecksumDetectionOptions, ChecksumDetectionResult, ChecksumSpec, ChecksumSpecResult,
    ChecksumValidationResult,
};

/// Result of batch checksum discovery.
///
/// Not `camelCase` like the rest, and hand-mapped in `api/checksums.ts` because
/// of it. Retired along with `batch_test_crc_cmd` once the frontend moves to the
/// crate's solver, which answers the same question without the round trip.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatchDiscoveryResult {
    /// Number of frames that matched
    pub match_count: usize,
    /// Total number of frames tested
    pub total_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumSweepResponse {
    pub results: Vec<ChecksumSpecResult>,
}

/// Calculate a checksum over a byte range.
///
/// `algorithm` is a catalogue id ("xor", "sum8", "crc16_modbus", …); offsets
/// support negative indexing.
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

/// Check a frame's stored checksum against a freshly calculated one.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
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

/// Resolve a byte index, supporting negative indexing (-1 = last byte).
#[tauri::command]
pub fn resolve_byte_index_cmd(index: i32, frame_length: usize) -> usize {
    resolve_byte_index(index, frame_length)
}

/// Calculate CRC-8 with arbitrary parameters.
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

/// Test one CRC configuration against many payloads.
///
/// The unit the frontend's polynomial brute force iterates — one IPC call per
/// polynomial, which is why an exhaustive CRC-16 search never finishes. The
/// crate's `solve_crc` replaces the whole loop with a single call; this stays
/// only until that lands.
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
    let match_count = payloads
        .iter()
        .zip(&expected_checksums)
        .filter(|(payload, expected)| {
            let calculated = if checksum_bits == 8 {
                crc8_parameterised(payload, polynomial as u8, init as u8, xor_out as u8, reflect)
                    as u16
            } else {
                crc16_parameterised(payload, polynomial, init, xor_out, reflect, reflect)
            };
            calculated == **expected
        })
        .count();

    BatchDiscoveryResult {
        match_count,
        total_count,
    }
}

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
    use std::collections::BTreeSet;
    use wiretap_checksum::ALL_NOTES;

    /// Rust decides *what* the checksum detector says; the frontend decides how.
    ///
    /// Notes cross as `{ code, values }` so the prose stays translatable, which
    /// means the two halves are joined by a string rather than by a type. A code
    /// with no key renders as the raw key to the user, and a renamed
    /// interpolation variable silently drops a value — neither is a compile
    /// error.
    ///
    /// This used to be a vitest suite parsing `checksums.rs?raw`. The engine now
    /// lives in another repository where Vite cannot reach it, so the pin moved
    /// here, where both the crate's `ALL_NOTES` manifest and the locale file are
    /// in scope.
    mod note_coverage {
        use super::*;

        fn translations() -> serde_json::Map<String, serde_json::Value> {
            let locale: serde_json::Value =
                serde_json::from_str(include_str!("../../src/locales/en-AU/discovery.json"))
                    .expect("discovery.json parses");
            locale["serial"]["checksumNote"]
                .as_object()
                .expect("serial.checksumNote is an object")
                .clone()
        }

        /// `{{name}}` placeholders in a translation string.
        fn placeholders(text: &str) -> BTreeSet<String> {
            text.split("{{")
                .skip(1)
                .filter_map(|rest| rest.split_once("}}"))
                .map(|(name, _)| name.trim().to_string())
                .collect()
        }

        #[test]
        fn every_code_the_engine_emits_has_a_translation() {
            let notes = translations();
            let missing: Vec<&str> = ALL_NOTES
                .iter()
                .map(|n| n.code)
                .filter(|code| !notes.contains_key(*code))
                .collect();

            assert_eq!(missing, Vec::<&str>::new());
        }

        #[test]
        fn no_translation_exists_for_a_code_nothing_emits() {
            let notes = translations();
            let orphaned: Vec<&String> = notes
                .keys()
                .filter(|key| !ALL_NOTES.iter().any(|n| n.code == key.as_str()))
                .collect();

            assert_eq!(orphaned, Vec::<&String>::new());
        }

        #[test]
        fn translations_interpolate_exactly_the_values_the_engine_sends() {
            let notes = translations();
            let mismatched: Vec<String> = ALL_NOTES
                .iter()
                .filter_map(|note| {
                    let text = notes.get(note.code)?.as_str()?;
                    let used = placeholders(text);
                    let sent: BTreeSet<String> =
                        note.values.iter().map(|v| (*v).to_string()).collect();

                    (used != sent).then(|| {
                        format!(
                            "{}: engine sends {sent:?}, translation uses {used:?}",
                            note.code
                        )
                    })
                })
                .collect();

            assert_eq!(mismatched, Vec::<String>::new());
        }
    }

    /// The commands are thin, but the two wire shapes they own are not the
    /// crate's, so they are worth a smoke test.
    #[test]
    fn batch_test_crc_counts_only_the_matching_payloads() {
        let payloads = vec![vec![0x01u8, 0x02, 0x03], vec![0x04, 0x05, 0x06]];
        let expected = vec![crc8_parameterised(&payloads[0], 0x07, 0, 0, false) as u16, 0xFF];

        let result = batch_test_crc_cmd(payloads, expected, 8, 0x07, 0, 0, false);
        assert_eq!(result.match_count, 1);
        assert_eq!(result.total_count, 2);
    }

    #[test]
    fn an_unknown_algorithm_name_is_an_error_not_a_default() {
        assert!(calculate_checksum_cmd("nope".into(), vec![1, 2], 0, -1).is_err());
        assert_eq!(
            calculate_checksum_cmd("sum8".into(), vec![1, 2, 0], 0, -1),
            Ok(0x03)
        );
    }
}
