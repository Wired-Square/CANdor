// ui/src-tauri/src/checksum_discovery.rs
//
// Checksum discovery across a whole capture: group by frame id, then ask the
// engine what explains each group.
//
// This used to run in TypeScript, one `batch_test_crc` IPC call per polynomial
// — 4,080 round trips per (frame id, position) for CRC-8 and 4,194,240 for
// CRC-16, which is why the CRC-16 checkbox was off by default and why nobody
// ever waited for it to finish. The whole scan is now one call, and the
// polynomial search is `solve_crc`, which recovers the polynomial from residue
// agreement rather than enumerating init and xorOut.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use wiretap_analysis::{checksum_evidence_with_columns, solve_targets, ChecksumEvidence};
use wiretap_checksum::{
    analyse_columns, detect_checksum_with_columns, diverse_samples, solve_additive, solve_crc,
    AdditiveOp, CalcRange, ChecksumAlgorithm, ChecksumCandidate, ChecksumDetectionOptions,
    ChecksumNote, ColumnStats, CrcParameters, CrcSolveOptions, SolvedChecksum, SolvedKind,
    MAX_SAMPLES,
};

/// Just enough of a `FrameMessage` to group and analyse. Serde ignores the rest
/// of the fields the frontend sends.
#[derive(Debug, Clone, Deserialize)]
pub struct DiscoveryFrame {
    pub frame_id: u32,
    pub bytes: Vec<u8>,
    #[serde(default)]
    pub is_extended: bool,
}

/// Default for [`ChecksumDiscoveryOptions::min_likeness`], shared with the MCP
/// parameter so the two surfaces cannot drift.
pub const DEFAULT_MIN_LIKENESS: u8 = 50;

/// Percentage below which a swept candidate is discarded.
///
/// A constant rather than an option: it was settable from neither the panel nor
/// the MCP parameters, and it is not a judgement a user is placed to make. A
/// checksum that reproduces 94% of a capture is not a checksum with a low score
/// — it is the wrong answer, and `min_likeness` is the knob for widening the
/// search.
const MIN_MATCH_RATE: f64 = 95.0;

/// Confidence below which a candidate is discarded. Unreachable as an option for
/// the same reason as [`MIN_MATCH_RATE`].
const MIN_CONFIDENCE: u8 = 35;

/// Cap on candidates reported per frame id.
const MAX_CANDIDATES_PER_ID: usize = 6;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChecksumDiscoveryOptions {
    /// Frames an id needs before it is worth analysing.
    pub min_samples: usize,
    /// Checksum offsets to try, end-relative.
    pub positions: Vec<i32>,
    /// Recover arbitrary CRC polynomials, not only the named algorithms.
    pub search_custom_polynomials: bool,
    /// How checksum-shaped a byte column must look before the solver is asked
    /// about it. Zero solves every column that was not rejected outright.
    pub min_likeness: u8,
}

impl Default for ChecksumDiscoveryOptions {
    fn default() -> Self {
        Self {
            min_samples: 10,
            positions: vec![-1, -2, -3],
            search_custom_polynomials: false,
            min_likeness: DEFAULT_MIN_LIKENESS,
        }
    }
}

/// How a checksum is computed. A named algorithm came from the scored sweep; the
/// other two were solved, and carry parameters no fixed list can express.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChecksumSpecification {
    Named {
        algorithm: ChecksumAlgorithm,
    },
    Additive {
        op: AdditiveOp,
        offset: u8,
    },
    Crc {
        #[serde(flatten)]
        parameters: CrcParameters,
    },
}

/// One configuration that explains a frame id, with the evidence for it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredChecksum {
    pub specification: ChecksumSpecification,
    pub position: i32,
    pub length: usize,
    pub big_endian: bool,
    pub calc_start_byte: i32,
    pub calc_end_byte: i32,
    pub match_count: usize,
    pub total_count: usize,
    /// 0-100.
    pub match_rate: f64,
    /// 0-100 composite score.
    pub confidence: u8,
    pub notes: Vec<ChecksumNote>,
    pub equivalent_ranges: Vec<CalcRange>,
}

impl From<ChecksumCandidate> for DiscoveredChecksum {
    fn from(c: ChecksumCandidate) -> Self {
        Self {
            specification: ChecksumSpecification::Named {
                algorithm: c.algorithm,
            },
            position: c.position,
            length: c.length,
            big_endian: c.big_endian,
            calc_start_byte: c.calc_start_byte,
            calc_end_byte: c.calc_end_byte,
            match_count: c.match_count,
            total_count: c.total_count,
            match_rate: c.match_rate,
            confidence: c.confidence,
            notes: c.notes,
            equivalent_ranges: c.equivalent_ranges,
        }
    }
}

impl DiscoveredChecksum {
    /// A solved configuration reproduces every sample it was verified against
    /// or is not reported at all, so its match rate is 100 by construction
    /// rather than by measurement.
    fn solved(solved: SolvedChecksum, confidence: u8) -> Self {
        let target = solved.target;
        Self {
            specification: match solved.kind {
                SolvedKind::Additive { op, offset } => {
                    ChecksumSpecification::Additive { op, offset }
                }
                SolvedKind::Crc(parameters) => ChecksumSpecification::Crc { parameters },
            },
            position: target.position,
            length: target.byte_length,
            big_endian: target.big_endian,
            calc_start_byte: target.calc_start_byte,
            calc_end_byte: target.calc_end_byte,
            match_count: solved.sample_count,
            total_count: solved.sample_count,
            match_rate: 100.0,
            confidence,
            notes: Vec::new(),
            equivalent_ranges: Vec::new(),
        }
    }
}

/// What the scan found for one frame id — including when it found nothing, so
/// the reason is visible rather than the id simply vanishing from the results.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameChecksumFinding {
    pub frame_id: u32,
    pub is_extended: bool,
    /// Frames seen for this id.
    pub frame_count: usize,
    /// Distinct payloads among them. A checksum cannot be recovered from
    /// repeats, so this is the number that actually bounds the search.
    pub distinct_payloads: usize,
    pub candidates: Vec<DiscoveredChecksum>,
    /// What identification decided about each byte column, rejections included.
    /// This is the useful half of an empty result: not "nothing found" but
    /// "byte -1 never changes, byte -2 is a counter".
    pub columns: Vec<ChecksumEvidence>,
    pub notes: Vec<ChecksumNote>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChecksumDiscoveryResult {
    pub findings: Vec<FrameChecksumFinding>,
    pub frame_count: usize,
    pub unique_frame_ids: usize,
    /// Ids skipped for having fewer than `min_samples` frames.
    pub skipped_frame_ids: usize,
}

/// Confidence for a solved configuration.
///
/// A solve reproduces every sample or is not reported, so match rate carries no
/// information here. What is left is how much evidence there was, and how
/// checksum-shaped the column looked before the solver was asked — which
/// identification has already measured, so this does not re-derive it.
fn score_solved(likeness: u8, sample_count: usize) -> u8 {
    let volume = match sample_count {
        n if n >= 200 => 20,
        n if n >= 50 => 15,
        n if n >= 20 => 10,
        n if n >= 8 => 5,
        _ => 0,
    };

    (55 + volume + likeness as i32 * 25 / 100).clamp(0, 100) as u8
}

/// Frames spread across the whole group, repeats included.
///
/// Strided rather than truncated so a match rate says something about the
/// capture and not about its first two seconds. Repeats are deliberately kept:
/// "this column never moved in 400 frames" is exactly the claim the
/// constant-column rejection rests on, and deduplicating first would leave it a
/// single sample to judge on — which is how an all-zero frame gets reported as a
/// flawless XOR.
///
/// Empties are dropped here because this is the only place that sees the raw
/// population: `discover_checksums` filters them while grouping, but the MCP
/// path reads payloads straight out of the capture and does not.
fn evidence_samples(frames: &[Vec<u8>]) -> Vec<Vec<u8>> {
    let usable: Vec<&Vec<u8>> = frames.iter().filter(|f| !f.is_empty()).collect();
    let stride = usable.len().div_ceil(MAX_SAMPLES).max(1);
    usable
        .into_iter()
        .step_by(stride)
        .take(MAX_SAMPLES)
        .cloned()
        .collect()
}

/// Analyse one frame id.
///
/// Public so a caller that already has payloads grouped — `analysis::checksum_scan`
/// reads them per id out of the capture — can skip flattening them only for
/// [`discover_checksums`] to group them again.
///
/// Two sample sets, because the two halves want opposite things. The sweep
/// measures a rate and needs the population; the solvers are killed only by
/// disagreements and need distinct payloads.
pub fn analyse_group(
    frame_id: u32,
    is_extended: bool,
    frames: &[Vec<u8>],
    options: &ChecksumDiscoveryOptions,
) -> FrameChecksumFinding {
    let samples = evidence_samples(frames);
    let solver_samples = diverse_samples(frames, MAX_SAMPLES);
    let distinct_payloads = solver_samples.len();

    // Profiled once and handed to both halves, so identification and the sweep
    // cannot reach different verdicts about the same byte.
    let column_stats = analyse_columns(&samples);

    // Identification first. Most byte columns on a real link are padding,
    // counters or sensor readings, and each one ruled out here is a whole
    // polynomial search not run.
    let columns = checksum_evidence_with_columns(&samples, &column_stats);

    let swept = detect_checksum_with_columns(
        &samples,
        &ChecksumDetectionOptions {
            positions: options.positions.clone(),
            lengths: Vec::new(),
            // A CAN frame declares no header fields for Discovery to pass on —
            // the chips that produce these are the serial view's. The 0/1/2
            // starts `calc_ranges` always offers cover a leading id or type
            // byte here.
            header_boundaries: Vec::new(),
            min_match_rate: MIN_MATCH_RATE,
            min_confidence: MIN_CONFIDENCE,
        },
        &column_stats,
    );

    let mut candidates: Vec<DiscoveredChecksum> = swept
        .candidates
        .into_iter()
        .map(DiscoveredChecksum::from)
        .chain(solved_candidates(
            &columns,
            &column_stats,
            &solver_samples,
            distinct_payloads,
            options,
        ))
        .collect();

    candidates.sort_by(|a, b| {
        b.confidence
            .cmp(&a.confidence)
            .then_with(|| b.match_rate.total_cmp(&a.match_rate))
            .then_with(|| a.length.cmp(&b.length))
            .then_with(|| a.calc_start_byte.cmp(&b.calc_start_byte))
    });
    candidates.truncate(MAX_CANDIDATES_PER_ID);

    FrameChecksumFinding {
        frame_id,
        is_extended,
        frame_count: frames.len(),
        distinct_payloads,
        candidates,
        columns,
        notes: swept.notes,
    }
}

/// Two solutions that are the same answer written over different byte ranges.
///
/// A constant range contributes a constant, which a sum absorbs into its offset
/// and a CRC into its `init`/`xorOut` residue — so those fields differ between
/// them and nothing else does. They are exactly what must be ignored when asking
/// whether two solutions agree.
///
/// Matched exhaustively rather than with a catch-all: a new checksum family
/// would otherwise compile cleanly and silently stop folding.
fn same_answer(a: &ChecksumSpecification, b: &ChecksumSpecification) -> bool {
    use ChecksumSpecification::{Additive, Crc, Named};
    match (a, b) {
        (Additive { op: x, .. }, Additive { op: y, .. }) => x == y,
        (Crc { parameters: x }, Crc { parameters: y }) => {
            x.width == y.width
                && x.polynomial == y.polynomial
                && x.reflect_in == y.reflect_in
                && x.reflect_out == y.reflect_out
        }
        // Only solved configurations reach the fold, and a solve never yields a
        // named algorithm — that arm comes from the sweep, which folds its own.
        (Named { .. }, _) | (Additive { .. }, _) | (Crc { .. }, _) => false,
    }
}

/// Fold solutions that differ only in a range the data cannot distinguish.
///
/// The solver is now offered every calculation range the sweep searches, and
/// wherever the bytes between two of those ranges are constant, *both* solve —
/// with a different offset each time. Left alone that turns one honest answer
/// into four candidates and makes the widened search read as noise.
///
/// The widest range wins and the rest become `equivalent_ranges`, the same
/// treatment the sweep's own `collapse_equivalent` gives an ambiguous range.
/// When only one range solves, the excluded bytes were not constant after all —
/// and that single answer is the real one, which is the case this whole change
/// exists to reach.
fn collapse_solved(mut solutions: Vec<DiscoveredChecksum>) -> Vec<DiscoveredChecksum> {
    // Widest first — lowest start, then the end furthest into the frame — so the
    // survivor of each group is the parsimonious one.
    solutions.sort_by(|a, b| {
        a.calc_start_byte
            .cmp(&b.calc_start_byte)
            .then_with(|| b.calc_end_byte.cmp(&a.calc_end_byte))
    });

    let mut kept: Vec<DiscoveredChecksum> = Vec::new();
    for solution in solutions {
        match kept.iter_mut().find(|k| {
            k.position == solution.position
                && k.length == solution.length
                && k.big_endian == solution.big_endian
                && same_answer(&k.specification, &solution.specification)
        }) {
            Some(winner) => winner.equivalent_ranges.push(CalcRange {
                calc_start_byte: solution.calc_start_byte,
                calc_end_byte: solution.calc_end_byte,
            }),
            None => kept.push(solution),
        }
    }
    kept
}

/// Solve the columns identification let through.
fn solved_candidates(
    columns: &[ChecksumEvidence],
    column_stats: &[ColumnStats],
    solver_samples: &[Vec<u8>],
    distinct_payloads: usize,
    options: &ChecksumDiscoveryOptions,
) -> Vec<DiscoveredChecksum> {
    let crc_options = CrcSolveOptions {
        known_polynomials_only: !options.search_custom_polynomials,
        max_solutions: 2,
    };

    let mut solutions = Vec::new();

    for target in solve_targets(columns, column_stats, options.min_likeness) {
        // A two-byte target is keyed on the lower of the pair, so take the best
        // likeness across the bytes it actually covers rather than one end's.
        let likeness = (0..target.byte_length as i32)
            .filter_map(|offset| {
                columns
                    .iter()
                    .find(|c| c.position == target.position + offset)
            })
            .map(|c| c.likeness)
            .max()
            .unwrap_or(0);

        let confidence = score_solved(likeness, distinct_payloads);
        if confidence < MIN_CONFIDENCE {
            continue;
        }

        // An offset of zero is plain XOR or Sum8, which the sweep already
        // reported and scored — only the variants it cannot express are news.
        let additive = solve_additive(solver_samples, &target).filter(|s| {
            !matches!(
                s.kind,
                SolvedKind::Additive {
                    op: AdditiveOp::Xor | AdditiveOp::Sum,
                    offset: 0
                }
            )
        });

        solutions.extend(
            additive
                .into_iter()
                .chain(solve_crc(solver_samples, &target, &crc_options))
                .map(|s| DiscoveredChecksum::solved(s, confidence)),
        );
    }

    collapse_solved(solutions)
}

/// Discover checksums across every frame id in a capture.
pub fn discover_checksums(
    frames: &[DiscoveryFrame],
    options: &ChecksumDiscoveryOptions,
) -> ChecksumDiscoveryResult {
    // Grouped in arrival order so the results read the way the capture does.
    let mut order: Vec<(u32, bool)> = Vec::new();
    let mut groups: std::collections::HashMap<(u32, bool), Vec<Vec<u8>>> =
        std::collections::HashMap::new();

    for frame in frames.iter().filter(|f| !f.bytes.is_empty()) {
        let key = (frame.frame_id, frame.is_extended);
        groups
            .entry(key)
            .or_insert_with(|| {
                order.push(key);
                Vec::new()
            })
            .push(frame.bytes.clone());
    }

    let unique_frame_ids = order.len();
    let findings: Vec<FrameChecksumFinding> = order
        .par_iter()
        .filter(|key| groups[key].len() >= options.min_samples)
        .map(|&(frame_id, is_extended)| {
            analyse_group(frame_id, is_extended, &groups[&(frame_id, is_extended)], options)
        })
        .collect();
    let skipped_frame_ids = unique_frame_ids - findings.len();

    ChecksumDiscoveryResult {
        findings,
        frame_count: frames.len(),
        unique_frame_ids,
        skipped_frame_ids,
    }
}

/// Scan a capture for checksums, one call for the whole run.
#[tauri::command]
pub fn discover_checksums_cmd(
    frames: Vec<DiscoveryFrame>,
    options: Option<ChecksumDiscoveryOptions>,
) -> ChecksumDiscoveryResult {
    discover_checksums(&frames, &options.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiretap_analysis::Rejection;
    use wiretap_checksum::algorithms::{crc8_parameterised, sum8_checksum};

    fn frame(frame_id: u32, bytes: Vec<u8>) -> DiscoveryFrame {
        DiscoveryFrame {
            frame_id,
            bytes,
            is_extended: false,
        }
    }

    /// A frame id whose last byte is a checksum over the rest.
    fn signed_frames<F: Fn(&[u8]) -> u8>(frame_id: u32, count: u32, sign: F) -> Vec<DiscoveryFrame> {
        (0..count)
            .map(|i| {
                let mut body = vec![
                    0x10,
                    i as u8,
                    (i >> 8) as u8,
                    (i.wrapping_mul(37) ^ 0x5A) as u8,
                    (i.wrapping_mul(211)) as u8,
                    0xC3,
                    (i.wrapping_mul(7) ^ 0xF0) as u8,
                ];
                let checksum = sign(&body);
                body.push(checksum);
                frame(frame_id, body)
            })
            .collect()
    }

    fn best(result: &ChecksumDiscoveryResult, frame_id: u32) -> &DiscoveredChecksum {
        let finding = result
            .findings
            .iter()
            .find(|f| f.frame_id == frame_id)
            .unwrap_or_else(|| panic!("no finding for {frame_id:#X}"));
        finding
            .candidates
            .first()
            .unwrap_or_else(|| panic!("no candidate for {frame_id:#X}"))
    }

    #[test]
    fn finds_a_named_algorithm() {
        let result = discover_checksums(&signed_frames(0x100, 40, sum8_checksum), &Default::default());

        assert_eq!(
            best(&result, 0x100).specification,
            ChecksumSpecification::Named {
                algorithm: ChecksumAlgorithm::Sum8
            }
        );
        assert_eq!(best(&result, 0x100).match_rate, 100.0);
    }

    /// The reason a solver exists: no named algorithm can express this, and the
    /// old brute force could not have found it either — it only varied the
    /// polynomial, never the offset.
    #[test]
    fn finds_a_sum_with_an_offset_no_named_algorithm_carries() {
        let frames = signed_frames(0x101, 40, |d| sum8_checksum(d).wrapping_add(0xA5));
        let result = discover_checksums(&frames, &Default::default());

        assert_eq!(
            best(&result, 0x101).specification,
            ChecksumSpecification::Additive {
                op: AdditiveOp::Sum,
                offset: 0xA5
            }
        );
    }

    #[test]
    fn recovers_an_arbitrary_polynomial_only_when_asked() {
        let frames = signed_frames(0x102, 60, |d| crc8_parameterised(d, 0x4D, 0xB7, 0x2C, false));

        let off = discover_checksums(&frames, &Default::default());
        assert!(off.findings[0].candidates.is_empty());

        let on = discover_checksums(
            &frames,
            &ChecksumDiscoveryOptions {
                search_custom_polynomials: true,
                ..Default::default()
            },
        );
        let ChecksumSpecification::Crc { parameters } = &best(&on, 0x102).specification else {
            panic!("expected a CRC, got {:?}", best(&on, 0x102).specification);
        };
        assert_eq!(parameters.polynomial, 0x4D);
    }

    /// The capability gap this milestone closes. The type byte *varies*, so it
    /// is not absorbed into an offset and only the range that excludes it can
    /// reproduce the frames. The solver used to calculate from byte 0 and
    /// nowhere else, so ticking "search custom polynomials" on a frame shaped
    /// like this reported nothing, with no knob to turn.
    #[test]
    fn solves_a_checksum_that_skips_a_varying_type_byte() {
        let frames: Vec<DiscoveryFrame> = (0..60u32)
            .map(|i| {
                let mut body = vec![
                    (i % 7) as u8,
                    (i.wrapping_mul(37) ^ 0x5A) as u8,
                    (i.wrapping_mul(211)) as u8,
                    0xC3,
                    (i.wrapping_mul(7) ^ 0xF0) as u8,
                ];
                let checksum = sum8_checksum(&body[1..]).wrapping_add(0xA5);
                body.push(checksum);
                frame(0x110, body)
            })
            .collect();

        let result = discover_checksums(&frames, &Default::default());
        let best = best(&result, 0x110);

        assert_eq!(
            best.specification,
            ChecksumSpecification::Additive {
                op: AdditiveOp::Sum,
                offset: 0xA5
            }
        );
        assert_eq!(best.calc_start_byte, 1);
        // Byte 0 moves, so no other start reproduces the data and there is
        // nothing to be ambiguous about.
        assert!(best.equivalent_ranges.is_empty(), "{best:?}");
    }

    /// The other half of the same change. When the excluded bytes *are*
    /// constant every start solves — with a different offset each — because a
    /// constant range contributes a constant. That is one answer written three
    /// ways, and it has to come back as one candidate or the widened search
    /// reads as noise.
    #[test]
    fn ranges_the_data_cannot_tell_apart_collapse_into_one_candidate() {
        // Bytes 0 and 1 are constant; byte -2 varies, so the range's end is not
        // ambiguous and only the start is.
        let frames: Vec<DiscoveryFrame> = (0..60u32)
            .map(|i| {
                let mut body = vec![
                    0x10,
                    0x20,
                    (i.wrapping_mul(37) ^ 0x5A) as u8,
                    (i.wrapping_mul(211)) as u8,
                    (i.wrapping_mul(7) ^ 0xF0) as u8,
                ];
                let checksum = sum8_checksum(&body).wrapping_add(0xA5);
                body.push(checksum);
                frame(0x111, body)
            })
            .collect();

        let finding = &discover_checksums(&frames, &Default::default()).findings[0];
        let sums: Vec<&DiscoveredChecksum> = finding
            .candidates
            .iter()
            .filter(|c| matches!(c.specification, ChecksumSpecification::Additive { .. }))
            .collect();

        assert_eq!(sums.len(), 1, "one answer, reported many ways: {sums:?}");
        // The widest range wins; the narrower ones are kept as alternatives
        // rather than dropped, because none of them is more true than another.
        assert_eq!(sums[0].calc_start_byte, 0);
        let starts: Vec<i32> = sums[0]
            .equivalent_ranges
            .iter()
            .map(|r| r.calc_start_byte)
            .collect();
        assert_eq!(starts, vec![1, 2]);
    }

    /// The live bug this milestone fixes. Every byte is zero, so XOR and Sum8
    /// over the body both reproduce the trailing 0x00 perfectly — and the old
    /// path reported a 100% XOR match because its simple-algorithm phase used
    /// the raw sweep, which has no constant-column rejection.
    #[test]
    fn an_all_zero_frame_is_padding_not_a_perfect_xor() {
        let frames: Vec<DiscoveryFrame> = (0..40).map(|_| frame(0x000, vec![0u8; 8])).collect();
        let result = discover_checksums(&frames, &Default::default());

        assert!(
            result.findings[0].candidates.is_empty(),
            "reported {:?}",
            result.findings[0].candidates
        );
    }

    /// A constant trailing byte beside varying data is padding too, and this is
    /// the shape most of the Sungrow bus actually has.
    #[test]
    fn a_constant_trailing_byte_beside_real_data_is_padding() {
        let frames: Vec<DiscoveryFrame> = (0..40u32)
            .map(|i| frame(0x013, vec![0x01, 0x07, i as u8, 0x00, 0x02, 0x02, (i * 3) as u8, 0x00]))
            .collect();

        let result = discover_checksums(&frames, &Default::default());
        assert!(result.findings[0]
            .candidates
            .iter()
            .all(|c| c.position != -1));
    }

    /// The trap the two sample sets exist for. Deduplicating before the sweep
    /// collapses 40 identical frames to one, and the constant-column rejection
    /// needs eight before it will call a column padding — so the guard goes
    /// quiet and the padding comes back as a flawless XOR. The evidence sample
    /// keeps the repeats; only the solvers see the deduplicated set.
    #[test]
    fn deduplication_does_not_disarm_the_padding_rejection() {
        let frames: Vec<DiscoveryFrame> = (0..40).map(|_| frame(0x001, vec![0u8; 8])).collect();
        let finding = &discover_checksums(&frames, &Default::default()).findings[0];

        assert_eq!(finding.distinct_payloads, 1);
        assert!(finding.candidates.is_empty(), "{:?}", finding.candidates);
    }

    /// An empty result has to say what it decided about each byte. "Nothing
    /// found" is not actionable; "byte -1 never changes, byte -2 is a counter"
    /// tells you where to look next.
    #[test]
    fn every_byte_column_comes_back_with_a_verdict() {
        // Byte -1 counts every frame, -3 moves once every twenty, -2 is
        // constant. The counter therefore advances while the rest holds still,
        // which is the shape that disqualifies it.
        let frames: Vec<DiscoveryFrame> = (0..60u32)
            .map(|i| frame(0x300, vec![0x10, (i / 20) as u8, 0x00, i as u8]))
            .collect();

        let finding = &discover_checksums(&frames, &Default::default()).findings[0];
        assert!(finding.candidates.is_empty());

        let verdict = |position: i32| {
            finding
                .columns
                .iter()
                .find(|c| c.position == position)
                .unwrap_or_else(|| panic!("no verdict for byte {position}"))
                .rejected
        };

        assert_eq!(verdict(-1), Some(Rejection::NotAFunctionOfTheOtherBytes));
        assert_eq!(verdict(-2), Some(Rejection::Constant));
    }

    #[test]
    fn reports_repeats_as_repeats_rather_than_as_evidence() {
        // 400 frames, two distinct payloads. The sample count must not read as
        // 400 anywhere a reader would take it for search strength.
        let frames: Vec<DiscoveryFrame> = [vec![0x01u8, 0x02, 0x03], vec![0x04, 0x05, 0x09]]
            .into_iter()
            .cycle()
            .take(400)
            .map(|b| frame(0x200, b))
            .collect();

        let finding = &discover_checksums(&frames, &Default::default()).findings[0];
        assert_eq!(finding.frame_count, 400);
        assert_eq!(finding.distinct_payloads, 2);
    }

    #[test]
    fn separates_frame_ids_and_counts_the_ones_it_skipped() {
        let mut frames = signed_frames(0x100, 40, sum8_checksum);
        frames.extend(signed_frames(0x101, 40, |d| {
            sum8_checksum(d).wrapping_add(0xA5)
        }));
        // Too few samples to be worth analysing.
        frames.extend(signed_frames(0x102, 3, sum8_checksum));

        let result = discover_checksums(&frames, &Default::default());
        assert_eq!(result.unique_frame_ids, 3);
        assert_eq!(result.skipped_frame_ids, 1);
        assert_eq!(result.findings.len(), 2);
        assert_eq!(result.frame_count, 83);
    }

    /// The gate has to pay for itself. A bus of padding and counters must reach
    /// the solver with nothing at all, which is what makes an exhaustive
    /// polynomial search affordable across a whole capture.
    #[test]
    fn a_bus_with_no_checksum_offers_the_solver_nothing() {
        let frames: Vec<DiscoveryFrame> = (0..60u32)
            .map(|i| frame(0x301, vec![0x10, 0x00, 0x00, i as u8]))
            .collect();
        let finding = &discover_checksums(
            &frames,
            &ChecksumDiscoveryOptions {
                search_custom_polynomials: true,
                ..Default::default()
            },
        )
        .findings[0];

        assert!(finding.candidates.is_empty());
        assert!(finding.columns.iter().all(|c| !c.is_candidate()));
    }

    /// Standard and extended ids sharing a number are different frames.
    #[test]
    fn an_extended_id_is_not_the_same_frame_as_a_standard_one() {
        let mut frames = signed_frames(0x100, 20, sum8_checksum);
        frames.extend(signed_frames(0x100, 20, sum8_checksum).into_iter().map(|mut f| {
            f.is_extended = true;
            f
        }));

        let result = discover_checksums(&frames, &Default::default());
        assert_eq!(result.unique_frame_ids, 2);
        assert_eq!(result.findings.len(), 2);
    }
}
