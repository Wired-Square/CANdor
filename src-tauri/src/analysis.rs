// ui/src-tauri/src/analysis.rs
//
// Source-backed analysis levers. Works against either a SQLite capture
// (`capture_id`) or a WireTAP backend (`profile_id`):
//
//   - frame_inventory   — per-frame-id rollup (count, first/last, dlc)
//   - byte_profile      — per-byte static/counter/sensor roles for one frame
//   - checksum_scan     — what explains each frame id, if anything
//   - catalog_coverage  — diff a catalog against a source + confidence rollup
//
// Most of these serve the MCP read tools and need no view open. `checksum_scan`
// serves the Discovery panel as well, which is what stops the two from giving
// different answers about one capture.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use tauri::AppHandle;
use wiretap_catalog::model::{Confidence, Signal};

use crate::capture_db::{hex_id, InventoryRow};

/// Where a query runs: a SQLite capture or a WireTAP backend profile.
pub enum QuerySource {
    Capture(String),
    Backend(String),
}

/// Resolve the source from the dual `capture_id` / `profile_id` MCP params.
pub fn resolve(
    capture_id: Option<String>,
    profile_id: Option<String>,
) -> Result<QuerySource, String> {
    match (capture_id, profile_id) {
        (Some(c), None) => Ok(QuerySource::Capture(c)),
        (None, Some(p)) => Ok(QuerySource::Backend(p)),
        (Some(_), Some(_)) => Err("Provide exactly one of capture_id / profile_id, not both".into()),
        (None, None) => Err("Provide one of capture_id or profile_id".into()),
    }
}

// ── Result types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ByteStat {
    pub index: usize,
    pub distinct: usize,
    pub min: u8,
    pub max: u8,
    pub changes: usize,
    /// "static" (never changes), "counter" (dominant fixed step) or "sensor".
    pub role: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ByteProfile {
    pub frame_id: u32,
    pub frame_id_hex: String,
    pub sampled: usize,
    pub max_len: usize,
    pub bytes: Vec<ByteStat>,
}

// ── Pure byte-role analysis ──────────────────────────────────────────────────

/// Classify each byte position across a set of payloads into static / counter /
/// sensor, with distinct/min/max/change counts. Pure and headless.
pub fn compute_byte_profile(payloads: &[Vec<u8>]) -> (usize, Vec<ByteStat>) {
    let max_len = payloads.iter().map(|p| p.len()).max().unwrap_or(0);
    let mut bytes = Vec::with_capacity(max_len);

    for index in 0..max_len {
        // Values at this position, in order, from payloads long enough to have it.
        let values: Vec<u8> = payloads.iter().filter_map(|p| p.get(index).copied()).collect();
        if values.is_empty() {
            continue;
        }

        let distinct: HashSet<u8> = values.iter().copied().collect();
        let min = *values.iter().min().unwrap();
        let max = *values.iter().max().unwrap();

        // Transition deltas (wrapping) to detect counters and count changes.
        let mut deltas: HashMap<u8, usize> = HashMap::new();
        for w in values.windows(2) {
            *deltas.entry(w[1].wrapping_sub(w[0])).or_default() += 1;
        }
        let transitions = values.len().saturating_sub(1);
        let changes: usize = deltas.iter().filter(|(d, _)| **d != 0).map(|(_, c)| c).sum();

        let role = if changes == 0 {
            "static"
        } else {
            // A counter has one dominant non-zero step covering most transitions.
            let modal = deltas.iter().filter(|(d, _)| **d != 0).map(|(_, c)| *c).max().unwrap_or(0);
            if transitions > 0 && (modal as f64 / transitions as f64) >= 0.8 {
                "counter"
            } else {
                "sensor"
            }
        };

        bytes.push(ByteStat { index, distinct: distinct.len(), min, max, changes, role: role.into() });
    }

    (max_len, bytes)
}

/// Parse an RFC3339 timestamp into epoch microseconds (capture timeline). Also
/// accepts a bare integer treated as already-µs.
pub fn iso_to_micros(s: &str) -> Option<i64> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_micros());
    }
    s.trim().parse::<i64>().ok()
}

// ── Source-dispatching orchestrators ─────────────────────────────────────────

pub async fn frame_inventory(
    app: &AppHandle,
    src: &QuerySource,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<Vec<InventoryRow>, String> {
    match src {
        QuerySource::Backend(pid) => {
            crate::dbquery::db_frame_inventory(app, pid, start_time, end_time).await
        }
        QuerySource::Capture(cid) => crate::capture_db::frame_inventory(
            cid,
            start_time.as_deref().and_then(iso_to_micros),
            end_time.as_deref().and_then(iso_to_micros),
        ),
    }
}

/// `protocol` is the identity's other half; `None` matches any.
async fn fetch_payloads(
    app: &AppHandle,
    src: &QuerySource,
    protocol: Option<&str>,
    frame_id: u32,
    is_extended: Option<bool>,
    sample_limit: u32,
) -> Result<Vec<Vec<u8>>, String> {
    match src {
        // No protocol and no stride: the backend serves a CAN-only archive, and a
        // modulo window over a multi-month archive is a full scan where the
        // tail query is an index seek. A capture is bounded and local, which is
        // what makes striding it affordable.
        QuerySource::Backend(pid) => {
            crate::dbquery::db_fetch_frame_payloads(app, pid, frame_id, is_extended, sample_limit)
                .await
        }
        QuerySource::Capture(cid) => crate::capture_db::sample_frame_payloads(
            cid,
            protocol,
            frame_id,
            is_extended,
            sample_limit,
        ),
    }
}

pub async fn byte_profile(
    app: &AppHandle,
    src: &QuerySource,
    protocol: Option<&str>,
    frame_id: u32,
    is_extended: Option<bool>,
    sample_limit: u32,
) -> Result<ByteProfile, String> {
    let payloads = fetch_payloads(app, src, protocol, frame_id, is_extended, sample_limit).await?;
    let (max_len, bytes) = compute_byte_profile(&payloads);
    Ok(ByteProfile {
        frame_id,
        frame_id_hex: hex_id(frame_id, is_extended.unwrap_or(false)),
        sampled: payloads.len(),
        max_len,
        bytes,
    })
}

/// Which frames a scan covers.
///
/// Both variants read empty as "everything", the convention `FrameSelection`
/// already documents — so neither door needs a third way to say "no filter".
pub enum ScanFilter {
    /// These ids under any protocol. What a caller holding bare numbers means,
    /// and all a CAN-only PostgreSQL archive can be asked for.
    Ids(Vec<u32>),
    /// These (protocol, id) pairs — Discovery's frame selection.
    Selection(crate::capture_store::FrameSelection),
}

impl ScanFilter {
    fn matches(&self, protocol: &str, frame_id: u32) -> bool {
        match self {
            ScanFilter::Ids(ids) => ids.is_empty() || ids.contains(&frame_id),
            ScanFilter::Selection(sel) => sel.is_empty() || sel.contains(protocol, frame_id),
        }
    }
}

/// Scan a whole source for checksums, frame id by frame id.
///
/// The one implementation behind both doors — Discovery's Checksum Discovery
/// panel and the `frame_checksum_scan` MCP tool — reading payloads straight out
/// of the capture or Postgres rather than having them shipped in over IPC.
/// `frame_inventory` decides which frames exist; each is then sampled and
/// analysed by the same crate code, so the two cannot give different answers
/// about the same capture.
pub async fn checksum_scan(
    app: &AppHandle,
    src: &QuerySource,
    filter: &ScanFilter,
    sample_limit: u32,
    options: wiretap_analysis::ChecksumScanOptions,
) -> Result<wiretap_analysis::ChecksumScanResult, String> {
    let inventory = frame_inventory(app, src, None, None).await?;

    // A frame id is almost never both standard and extended, and filtering on
    // `is_extended` takes the payload query off its covering index. Pay for it
    // only where the inventory says the pair is genuinely ambiguous.
    let mut seen: HashMap<(&str, u32), usize> = HashMap::new();
    for row in &inventory {
        *seen.entry((row.protocol.as_str(), row.frame_id)).or_default() += 1;
    }

    let mut result = wiretap_analysis::ChecksumScanResult {
        findings: Vec::new(),
        frame_count: 0,
        unique_frame_ids: 0,
        skipped_frame_ids: 0,
    };
    // Fetched a chunk at a time so at most `SCAN_CHUNK_IDS` groups are resident
    // — `sample_limit` and the id count are both unbounded — while `scan_groups`
    // still gets several ids to spread across cores. One id at a time held the
    // memory floor but cost the fan-out, which on a 60-id bus is most of the run.
    let mut chunk: Vec<(wiretap_analysis::FrameKey, Vec<Vec<u8>>)> = Vec::new();

    for row in &inventory {
        if !filter.matches(&row.protocol, row.frame_id) {
            continue;
        }
        let ambiguous = seen[&(row.protocol.as_str(), row.frame_id)] > 1;
        let payloads = fetch_payloads(
            app,
            src,
            Some(&row.protocol),
            row.frame_id,
            ambiguous.then_some(row.is_extended),
            sample_limit,
        )
        .await?;
        chunk.push((
            wiretap_analysis::FrameKey::new(row.frame_id, row.is_extended),
            payloads,
        ));
        if chunk.len() == SCAN_CHUNK_IDS {
            accumulate(&mut result, wiretap_analysis::scan_groups(&chunk, &options));
            chunk.clear();
        }
    }
    if !chunk.is_empty() {
        accumulate(&mut result, wiretap_analysis::scan_groups(&chunk, &options));
    }

    Ok(result)
}

/// Frame ids fetched before a batch is analysed. Bounds resident payloads while
/// leaving `scan_groups` enough groups to be worth parallelising.
const SCAN_CHUNK_IDS: usize = 16;

fn accumulate(
    total: &mut wiretap_analysis::ChecksumScanResult,
    part: wiretap_analysis::ChecksumScanResult,
) {
    total.findings.extend(part.findings);
    total.frame_count += part.frame_count;
    total.unique_frame_ids += part.unique_frame_ids;
    total.skipped_frame_ids += part.skipped_frame_ids;
}

// ── Catalog coverage ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize)]
pub struct ConfidenceTally {
    pub high: usize,
    pub medium: usize,
    pub low: usize,
    pub unset: usize,
}

impl ConfidenceTally {
    fn add(&mut self, c: Option<Confidence>) {
        match c {
            Some(Confidence::High) => self.high += 1,
            Some(Confidence::Medium) => self.medium += 1,
            Some(Confidence::Low) => self.low += 1,
            Some(Confidence::None) | None => self.unset += 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SignalCoverage {
    pub name: String,
    pub confidence: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PresentFrame {
    pub frame_id: u32,
    pub frame_id_hex: String,
    pub name: Option<String>,
    pub count: i64,
    pub first_us: i64,
    pub last_us: i64,
    pub signals: Vec<SignalCoverage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_roles: Option<Vec<ByteStat>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MissingFrame {
    pub frame_id: u32,
    pub frame_id_hex: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UncataloguedFrame {
    pub frame_id: u32,
    pub frame_id_hex: String,
    pub is_extended: bool,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoverageReport {
    pub catalog: String,
    pub catalog_frames: usize,
    pub data_frames: usize,
    pub present: Vec<PresentFrame>,
    pub missing: Vec<MissingFrame>,
    pub uncatalogued: Vec<UncataloguedFrame>,
    /// Confidence rollup over directly-defined catalog signals (excludes
    /// mirror/copy-inherited duplicates).
    pub confidence: ConfidenceTally,
}

/// Collect every directly-defined signal of a frame (own + mux cases, nested),
/// skipping mirror/copy-inherited duplicates so each definition counts once.
fn collect_signals<'a>(signals: &'a [Signal], out: &mut Vec<&'a Signal>) {
    for s in signals {
        if !s.inherited {
            out.push(s);
        }
    }
}

fn collect_frame_signals(frame: &wiretap_catalog::model::Frame) -> Vec<&Signal> {
    let mut out = Vec::new();
    collect_signals(&frame.signals, &mut out);
    if let Some(mux) = &frame.mux {
        collect_mux(mux, &mut out);
    }
    out
}

fn collect_mux<'a>(mux: &'a wiretap_catalog::model::Mux, out: &mut Vec<&'a Signal>) {
    for case in mux.cases.values() {
        collect_signals(&case.signals, out);
        if let Some(inner) = &case.mux {
            collect_mux(inner, out);
        }
    }
}

fn confidence_str(c: Option<Confidence>) -> &'static str {
    match c {
        Some(Confidence::High) => "high",
        Some(Confidence::Medium) => "medium",
        Some(Confidence::Low) => "low",
        Some(Confidence::None) | None => "unset",
    }
}

/// A human label for a frame: its catalogue name, falling back to the transmitter.
fn frame_label(f: &wiretap_catalog::model::Frame) -> Option<String> {
    f.name.clone().or_else(|| f.transmitter.clone())
}

pub async fn catalog_coverage(
    app: &AppHandle,
    src: &QuerySource,
    catalog_name: &str,
    include_byte_roles: bool,
    sample_limit: u32,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<CoverageReport, String> {
    // 1. Load + parse the catalog (reuse the MCP catalog resolution).
    let catalogs = crate::catalog::list_catalogs(app.clone()).await?;
    let entry = catalogs
        .iter()
        .find(|c| c.filename == catalog_name || c.name == catalog_name)
        .ok_or_else(|| format!("Catalog '{}' not found — use list_catalogs", catalog_name))?;
    let toml = crate::catalog::open_catalog(entry.path.clone()).await?;
    let catalog = wiretap_catalog::Catalog::parse(&toml).map_err(|e| e.to_string())?;

    // 2. Inventory the data source.
    let inventory = frame_inventory(app, src, start_time, end_time).await?;
    let mut data_by_id: HashMap<u32, &InventoryRow> = HashMap::new();
    for row in &inventory {
        // Keep the highest-count row when an id appears as both std/extended.
        data_by_id
            .entry(row.frame_id)
            .and_modify(|e| {
                if row.count > e.count {
                    *e = row;
                }
            })
            .or_insert(row);
    }

    // 3. Diff + confidence rollup.
    let mut confidence = ConfidenceTally::default();
    let mut present = Vec::new();
    let mut missing = Vec::new();
    let catalog_ids: HashSet<u32> = catalog.frames.iter().map(|f| f.frame_id).collect();

    for frame in &catalog.frames {
        let sigs = collect_frame_signals(frame);
        for s in &sigs {
            confidence.add(s.confidence);
        }

        match data_by_id.get(&frame.frame_id) {
            Some(row) => {
                let byte_roles = if include_byte_roles {
                    // `data_by_id` is keyed on the bare id, so this row is not
                    // authoritative about protocol — asking for any keeps the
                    // roles describing the same frames the row was counted from.
                    let payloads = fetch_payloads(
                        app,
                        src,
                        None,
                        frame.frame_id,
                        frame.is_extended,
                        sample_limit,
                    )
                    .await
                    .unwrap_or_default();
                    Some(compute_byte_profile(&payloads).1)
                } else {
                    None
                };
                present.push(PresentFrame {
                    frame_id: frame.frame_id,
                    frame_id_hex: hex_id(frame.frame_id, row.is_extended),
                    name: frame_label(frame),
                    count: row.count,
                    first_us: row.first_us,
                    last_us: row.last_us,
                    signals: sigs
                        .iter()
                        .filter_map(|s| {
                            s.name.clone().map(|name| SignalCoverage {
                                name,
                                confidence: confidence_str(s.confidence).into(),
                            })
                        })
                        .collect(),
                    byte_roles,
                });
            }
            None => missing.push(MissingFrame {
                frame_id: frame.frame_id,
                frame_id_hex: hex_id(frame.frame_id, frame.is_extended.unwrap_or(false)),
                name: frame_label(frame),
            }),
        }
    }

    // 4. Data frames the catalog doesn't describe.
    let mut uncatalogued: Vec<UncataloguedFrame> = inventory
        .iter()
        .filter(|r| !catalog_ids.contains(&r.frame_id))
        .map(|r| UncataloguedFrame {
            frame_id: r.frame_id,
            frame_id_hex: r.frame_id_hex.clone(),
            is_extended: r.is_extended,
            count: r.count,
        })
        .collect();
    uncatalogued.sort_by_key(|f| f.frame_id);
    // De-dup ids that appeared as both std + extended.
    uncatalogued.dedup_by_key(|f| f.frame_id);

    Ok(CoverageReport {
        catalog: entry.name.clone(),
        catalog_frames: catalog.frames.len(),
        data_frames: data_by_id.len(),
        present,
        missing,
        uncatalogued,
        confidence,
    })
}
