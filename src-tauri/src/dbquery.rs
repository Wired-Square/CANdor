// ui/src-tauri/src/dbquery.rs
//
// The Query app's analytical queries against a WireTAP backend.
//
// Every query here is a thin Tauri command over `apiclient` — the backend owns
// the database, and the app talks to it over HTTP. WireTAP used to also connect
// to PostgreSQL directly, which meant two implementations of each query (one in
// SQL here, one over the wire there) that had to agree, and a `tokio_postgres`
// dependency for a path the backend already served. The result types below stay
// because they are the contract both the API and the SQLite capture queries
// (`capturequery.rs`) answer in.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use tauri::AppHandle;

use crate::settings::{load_settings, IOProfile};

pub use crate::apiclient::RunningQueryInfo;

/// Every query currently in flight, for the session status log.
pub async fn get_running_queries() -> Vec<(String, RunningQueryInfo)> {
    crate::apiclient::running_queries().await
}

/// Cancel a running query.
#[tauri::command]
pub async fn db_cancel_query(query_id: String) -> Result<(), String> {
    if crate::apiclient::cancel_query(&query_id).await {
        tlog!("[dbquery] Cancelled query: {}", query_id);
        return Ok(());
    }
    Err(format!("Query not found: {}", query_id))
}

/// Result of a byte change query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ByteChangeResult {
    pub timestamp_us: i64,
    pub old_value: u8,
    pub new_value: u8,
}

/// Result of a frame change query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameChangeResult {
    pub timestamp_us: i64,
    pub old_payload: Vec<u8>,
    pub new_payload: Vec<u8>,
    pub changed_indices: Vec<usize>,
}

/// Query statistics returned with results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryStats {
    /// Number of rows fetched from the database
    pub rows_scanned: usize,
    /// Number of results after filtering
    pub results_count: usize,
    /// Query execution time in milliseconds
    pub execution_time_ms: u64,
}

/// Wrapper for byte change query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ByteChangeQueryResult {
    pub results: Vec<ByteChangeResult>,
    pub stats: QueryStats,
}

/// Wrapper for frame change query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameChangeQueryResult {
    pub results: Vec<FrameChangeResult>,
    pub stats: QueryStats,
}

/// Result of a mirror validation query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorValidationResult {
    pub mirror_timestamp_us: i64,
    pub source_timestamp_us: i64,
    pub mirror_payload: Vec<u8>,
    pub source_payload: Vec<u8>,
    pub mismatch_indices: Vec<usize>,
}

/// Wrapper for mirror validation query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorValidationQueryResult {
    pub results: Vec<MirrorValidationResult>,
    pub stats: QueryStats,
}

/// Byte indices where two payloads differ, restricted to `compare` when the
/// caller supplied one. A payload shorter than the other is read as zero-padded.
///
/// `None` compares the whole payload — what a frame-to-frame change query wants,
/// and the only sensible answer for a mirror query with no catalogue to consult.
/// When a set *is* given it must be the mirror frame's inherited bytes
/// (`wiretap_catalog::mirror::inherited_byte_indices`), which is what the live
/// Decoder compares: a byte covered by a signal the mirror declares itself is
/// deliberately different data, not a fault, and reporting it here would
/// contradict the badge in the Decoder.
pub fn differing_byte_indices(a: &[u8], b: &[u8], compare: Option<&BTreeSet<usize>>) -> Vec<usize> {
    (0..a.len().max(b.len()))
        .filter(|i| compare.is_none_or(|set| set.contains(i)))
        .filter(|&i| a.get(i).copied().unwrap_or(0) != b.get(i).copied().unwrap_or(0))
        .collect()
}

/// Normalise the frontend's `compare_byte_indices` argument into a lookup set.
/// An empty list is treated as "no restriction", so a caller that has no
/// catalogue loaded behaves exactly as before.
pub fn compare_index_set(indices: Option<Vec<u8>>) -> Option<BTreeSet<usize>> {
    indices
        .filter(|v| !v.is_empty())
        .map(|v| v.into_iter().map(usize::from).collect())
}

/// Statistics for a single byte position within a mux case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BytePositionStats {
    pub byte_index: u8,
    pub min: u8,
    pub max: u8,
    pub avg: f64,
    pub distinct_count: u32,
    pub sample_count: u64,
}

/// Statistics for a reconstructed 16-bit value from two adjacent bytes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word16Stats {
    pub start_byte: u8,
    pub endianness: String,
    pub min: u16,
    pub max: u16,
    pub avg: f64,
    pub distinct_count: u32,
}

/// Statistics for a single mux case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuxCaseStats {
    pub mux_value: u16,
    pub frame_count: u64,
    pub byte_stats: Vec<BytePositionStats>,
    pub word16_stats: Vec<Word16Stats>,
}

/// Full result of a mux statistics query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuxStatisticsResult {
    pub mux_byte: u8,
    pub total_frames: u64,
    pub cases: Vec<MuxCaseStats>,
}

/// Wrapper for mux statistics query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MuxStatisticsQueryResult {
    pub results: MuxStatisticsResult,
    pub stats: QueryStats,
}

/// Result of a first/last query
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirstLastResult {
    pub first_timestamp_us: i64,
    pub first_payload: Vec<u8>,
    pub last_timestamp_us: i64,
    pub last_payload: Vec<u8>,
    pub total_count: i64,
}

/// Wrapper for first/last query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirstLastQueryResult {
    pub results: FirstLastResult,
    pub stats: QueryStats,
}

/// A single frequency bucket with interval statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyBucket {
    pub bucket_start_us: i64,
    pub frame_count: i64,
    pub min_interval_us: f64,
    pub max_interval_us: f64,
    pub avg_interval_us: f64,
}

/// Wrapper for frequency query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrequencyQueryResult {
    pub results: Vec<FrequencyBucket>,
    pub stats: QueryStats,
}

/// A single byte value distribution entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionResult {
    pub value: u8,
    pub count: i64,
    pub percentage: f64,
}

/// Wrapper for distribution query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionQueryResult {
    pub results: Vec<DistributionResult>,
    pub stats: QueryStats,
}

/// A detected gap in frame transmission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapResult {
    pub gap_start_us: i64,
    pub gap_end_us: i64,
    pub duration_ms: f64,
}

/// Wrapper for gap analysis query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GapAnalysisQueryResult {
    pub results: Vec<GapResult>,
    pub stats: QueryStats,
}

/// A frame matching a byte pattern search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternSearchResult {
    pub timestamp_us: i64,
    pub frame_id: u32,
    pub is_extended: bool,
    pub payload: Vec<u8>,
    pub match_positions: Vec<usize>,
}

/// Wrapper for pattern search query results with stats
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternSearchQueryResult {
    pub results: Vec<PatternSearchResult>,
    pub stats: QueryStats,
}

/// Compute per-mux-case statistics from grouped payloads.
/// `payloads_by_mux` maps mux selector value -> list of raw frame payloads.
/// `mux_byte` is the byte index of the mux selector (used to skip it in stats).
/// `payload_length` is the expected payload width for byte iteration.
pub fn compute_mux_statistics(
    payloads_by_mux: &BTreeMap<u16, Vec<Vec<u8>>>,
    include_16bit: bool,
    mux_byte: u8,
    payload_length: u8,
) -> MuxStatisticsResult {
    let mut total_frames: u64 = 0;
    let mut cases = Vec::new();
    let start_byte = (mux_byte + 1) as usize;
    let end_byte = payload_length as usize;

    for (&mux_value, payloads) in payloads_by_mux {
        let frame_count = payloads.len() as u64;
        total_frames += frame_count;

        // Per-byte statistics
        let mut byte_stats = Vec::new();
        for byte_idx in start_byte..end_byte {
            let mut min: u8 = 255;
            let mut max: u8 = 0;
            let mut sum: f64 = 0.0;
            let mut distinct = HashSet::new();
            let mut count: u64 = 0;

            for payload in payloads {
                if byte_idx < payload.len() {
                    let val = payload[byte_idx];
                    if val < min {
                        min = val;
                    }
                    if val > max {
                        max = val;
                    }
                    sum += val as f64;
                    distinct.insert(val);
                    count += 1;
                }
            }

            if count > 0 {
                byte_stats.push(BytePositionStats {
                    byte_index: byte_idx as u8,
                    min,
                    max,
                    avg: sum / count as f64,
                    distinct_count: distinct.len() as u32,
                    sample_count: count,
                });
            }
        }

        // 16-bit word statistics (LE and BE for each adjacent pair)
        let mut word16_stats = Vec::new();
        if include_16bit {
            let mut byte_idx = start_byte;
            while byte_idx + 1 < end_byte {
                // Little-endian: low byte first
                let mut le_min: u16 = u16::MAX;
                let mut le_max: u16 = 0;
                let mut le_sum: f64 = 0.0;
                let mut le_distinct = HashSet::new();

                // Big-endian: high byte first
                let mut be_min: u16 = u16::MAX;
                let mut be_max: u16 = 0;
                let mut be_sum: f64 = 0.0;
                let mut be_distinct = HashSet::new();

                let mut word_count: u64 = 0;

                for payload in payloads {
                    if byte_idx + 1 < payload.len() {
                        let lo = payload[byte_idx] as u16;
                        let hi = payload[byte_idx + 1] as u16;

                        let le_val = lo | (hi << 8);
                        let be_val = (lo << 8) | hi;

                        if le_val < le_min {
                            le_min = le_val;
                        }
                        if le_val > le_max {
                            le_max = le_val;
                        }
                        le_sum += le_val as f64;
                        le_distinct.insert(le_val);

                        if be_val < be_min {
                            be_min = be_val;
                        }
                        if be_val > be_max {
                            be_max = be_val;
                        }
                        be_sum += be_val as f64;
                        be_distinct.insert(be_val);

                        word_count += 1;
                    }
                }

                if word_count > 0 {
                    word16_stats.push(Word16Stats {
                        start_byte: byte_idx as u8,
                        endianness: "le".to_string(),
                        min: le_min,
                        max: le_max,
                        avg: le_sum / word_count as f64,
                        distinct_count: le_distinct.len() as u32,
                    });
                    word16_stats.push(Word16Stats {
                        start_byte: byte_idx as u8,
                        endianness: "be".to_string(),
                        min: be_min,
                        max: be_max,
                        avg: be_sum / word_count as f64,
                        distinct_count: be_distinct.len() as u32,
                    });
                }

                byte_idx += 2;
            }
        }

        cases.push(MuxCaseStats {
            mux_value,
            frame_count,
            byte_stats,
            word16_stats,
        });
    }

    MuxStatisticsResult {
        mux_byte,
        total_frames,
        cases,
    }
}

/// A running query or session from pg_stat_activity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseActivity {
    /// Process ID (pid) of the backend
    pub pid: i32,
    /// Database name
    pub database: Option<String>,
    /// Username
    pub username: Option<String>,
    /// Application name (e.g., "WireTAP Query")
    pub application_name: Option<String>,
    /// Client address
    pub client_addr: Option<String>,
    /// Current state (active, idle, idle in transaction, etc.)
    pub state: Option<String>,
    /// Current query text (truncated)
    pub query: Option<String>,
    /// When the query started (ISO 8601)
    pub query_start: Option<String>,
    /// How long the query has been running in seconds
    pub duration_secs: Option<f64>,
    /// Whether this is a query we can cancel (our own connection)
    pub is_cancellable: bool,
}

/// Result of querying database activity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseActivityResult {
    /// Active queries running on the database
    pub queries: Vec<DatabaseActivity>,
    /// Active sessions connected to the database
    pub sessions: Vec<DatabaseActivity>,
}

/// Build PostgreSQL connection string from profile

// ── Profile resolution ───────────────────────────────────────────────────────

fn find_profile(settings: &crate::settings::AppSettings, profile_id: &str) -> Option<IOProfile> {
    settings.io_profiles.iter().find(|p| p.id == profile_id).cloned()
}

/// Resolve a profile id to a WireTAP backend profile.
///
/// A database-backed source is a `wiretap` profile and nothing else. Anything
/// else reaching here is a caller passing the wrong profile, not a source this
/// module should try to open.
async fn backend_profile(app: &AppHandle, profile_id: &str) -> Result<IOProfile, String> {
    let settings = load_settings(app.clone())
        .await
        .map_err(|e| format!("Failed to load settings: {}", e))?;
    let profile = find_profile(&settings, profile_id)
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;
    if profile.kind != "wiretap" {
        return Err(format!(
            "Profile '{}' is a {} source, not a WireTAP backend",
            profile.name, profile.kind
        ));
    }
    Ok(profile)
}

/// A query id for a call that did not bring one. Only queries the caller can
/// name are cancellable, so this is a label rather than a handle.
fn query_id_or(kind: &str, supplied: Option<String>) -> String {
    supplied.unwrap_or_else(|| format!("{kind}_{:?}", std::time::Instant::now()))
}

// ── Queries ──────────────────────────────────────────────────────────────────

pub async fn db_frame_inventory(
    app: &AppHandle,
    profile_id: &str,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<Vec<(u32, bool, i64, i64, i64, u8)>, String> {
    let profile = backend_profile(app, profile_id).await?;
    crate::apiclient::frame_inventory(&profile, start_time, end_time).await
}

pub async fn db_fetch_frame_payloads(
    app: &AppHandle,
    profile_id: &str,
    frame_id: u32,
    is_extended: Option<bool>,
    limit: u32,
) -> Result<Vec<Vec<u8>>, String> {
    let profile = backend_profile(app, profile_id).await?;
    crate::apiclient::fetch_frame_payloads(&profile, frame_id, is_extended, limit).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_byte_changes(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    byte_index: u8,
    is_extended: Option<bool>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<ByteChangeQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::byte_changes(
        &profile,
        frame_id,
        byte_index,
        is_extended,
        start_time,
        end_time,
        limit,
        query_id_or("byte_changes", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_frame_changes(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    is_extended: Option<bool>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<FrameChangeQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::frame_changes(
        &profile,
        frame_id,
        is_extended,
        start_time,
        end_time,
        limit,
        query_id_or("frame_changes", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_mirror_validation(
    app: AppHandle,
    profile_id: String,
    mirror_frame_id: u32,
    source_frame_id: u32,
    is_extended: Option<bool>,
    tolerance_ms: u32,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
    compare_byte_indices: Option<Vec<u8>>,
) -> Result<MirrorValidationQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::mirror_validation(
        &profile,
        mirror_frame_id,
        source_frame_id,
        is_extended,
        tolerance_ms,
        start_time,
        end_time,
        limit,
        query_id_or("mirror_validation", query_id),
        compare_index_set(compare_byte_indices),
    )
    .await
}

#[tauri::command]
pub async fn db_query_activity(
    app: AppHandle,
    profile_id: String,
) -> Result<DatabaseActivityResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::activity(&profile).await
}

#[tauri::command]
pub async fn db_cancel_backend(
    app: AppHandle,
    profile_id: String,
    pid: i32,
) -> Result<bool, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::signal_backend(&profile, pid, false).await
}

#[tauri::command]
pub async fn db_terminate_backend(
    app: AppHandle,
    profile_id: String,
    pid: i32,
) -> Result<bool, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::signal_backend(&profile, pid, true).await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_mux_statistics(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    mux_selector_byte: u8,
    is_extended: Option<bool>,
    include_16bit: bool,
    payload_length: u8,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<MuxStatisticsQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::mux_statistics(
        &profile,
        frame_id,
        mux_selector_byte,
        is_extended,
        include_16bit,
        payload_length,
        start_time,
        end_time,
        limit,
        query_id_or("mux_statistics", query_id),
    )
    .await
}

#[tauri::command]
pub async fn db_query_first_last(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    is_extended: Option<bool>,
    start_time: Option<String>,
    end_time: Option<String>,
    query_id: Option<String>,
) -> Result<FirstLastQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::first_last(
        &profile,
        frame_id,
        is_extended,
        start_time,
        end_time,
        query_id_or("first_last", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_frequency(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    is_extended: Option<bool>,
    bucket_size_ms: u32,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<FrequencyQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::frequency(
        &profile,
        frame_id,
        is_extended,
        bucket_size_ms,
        start_time,
        end_time,
        limit,
        query_id_or("frequency", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_distribution(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    byte_index: u8,
    is_extended: Option<bool>,
    start_time: Option<String>,
    end_time: Option<String>,
    query_id: Option<String>,
) -> Result<DistributionQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::distribution(
        &profile,
        frame_id,
        byte_index,
        is_extended,
        start_time,
        end_time,
        query_id_or("distribution", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_gap_analysis(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    is_extended: Option<bool>,
    gap_threshold_ms: f64,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<GapAnalysisQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::gap_analysis(
        &profile,
        frame_id,
        is_extended,
        gap_threshold_ms,
        start_time,
        end_time,
        limit,
        query_id_or("gap_analysis", query_id),
    )
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn db_query_pattern_search(
    app: AppHandle,
    profile_id: String,
    pattern: Vec<u8>,
    pattern_mask: Vec<u8>,
    start_time: Option<String>,
    end_time: Option<String>,
    limit: Option<u32>,
    query_id: Option<String>,
) -> Result<PatternSearchQueryResult, String> {
    let profile = backend_profile(&app, &profile_id).await?;
    crate::apiclient::pattern_search(
        &profile,
        pattern,
        pattern_mask,
        start_time,
        end_time,
        limit,
        query_id_or("pattern_search", query_id),
    )
    .await
}
