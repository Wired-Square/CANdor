// ui/src-tauri/src/dbquery.rs
//
// Database query commands for the Query app. Provides analytical queries
// against PostgreSQL data sources to find historical patterns and changes.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio_postgres::NoTls;

use crate::credentials::get_credential;
use crate::settings::{load_settings, IOProfile};

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

/// Build PostgreSQL connection string from profile
fn build_connection_string(profile: &IOProfile, password: Option<String>) -> String {
    let conn = &profile.connection;

    let host = conn
        .get("host")
        .and_then(|v| v.as_str())
        .unwrap_or("localhost");
    let port = conn
        .get("port")
        .and_then(|v| v.as_u64())
        .unwrap_or(5432);
    let database = conn
        .get("database")
        .and_then(|v| v.as_str())
        .unwrap_or("candor");
    let username = conn
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("postgres");
    let sslmode = conn
        .get("sslmode")
        .and_then(|v| v.as_str())
        .unwrap_or("prefer");

    let mut parts = vec![
        format!("host={}", host),
        format!("port={}", port),
        format!("dbname={}", database),
        format!("user={}", username),
        format!("sslmode={}", sslmode),
    ];

    if let Some(pw) = password {
        parts.push(format!("password={}", pw));
    }

    parts.join(" ")
}

/// Find the profile by ID from settings
fn find_profile(settings: &crate::settings::AppSettings, profile_id: &str) -> Option<IOProfile> {
    settings
        .io_profiles
        .iter()
        .find(|p| p.id == profile_id)
        .cloned()
}

/// Get password for a PostgreSQL profile
fn get_profile_password(profile: &IOProfile) -> Option<String> {
    // Check if password is stored in credential storage
    // Note: field is "_password_stored" with underscore prefix (metadata field)
    let password_stored = profile.connection.get("_password_stored")
        .or_else(|| profile.connection.get("password_stored"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    println!("[dbquery] get_profile_password: password_stored={}", password_stored);

    if password_stored {
        // Try to get from credential storage (field is "password")
        match get_credential(&profile.id, "password") {
            Ok(Some(pw)) => {
                println!("[dbquery] get_profile_password: got password from credential storage");
                Some(pw)
            }
            Ok(None) => {
                println!("[dbquery] get_profile_password: no password in credential storage");
                None
            }
            Err(e) => {
                println!("[dbquery] get_profile_password: credential storage error: {}", e);
                None
            }
        }
    } else {
        // Fall back to connection config
        let pw = profile.connection.get("password").and_then(|v| v.as_str()).map(|s| s.to_string());
        println!("[dbquery] get_profile_password: from config: {}", if pw.is_some() { "found" } else { "not found" });
        pw
    }
}

/// Query for byte changes in a specific frame
///
/// Returns a list of timestamps where the specified byte changed value.
#[tauri::command]
pub async fn db_query_byte_changes(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    byte_index: u8,
    is_extended: bool,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<ByteChangeQueryResult, String> {
    let query_start = std::time::Instant::now();
    println!("[dbquery] db_query_byte_changes called with profile_id='{}', frame_id={}, byte_index={}, is_extended={}",
        profile_id, frame_id, byte_index, is_extended);

    // Load settings to get profile
    let settings = load_settings(app).await.map_err(|e| format!("Failed to load settings: {}", e))?;

    println!("[dbquery] Loaded settings, found {} IO profiles", settings.io_profiles.len());

    let profile = find_profile(&settings, &profile_id)
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    println!("[dbquery] Found profile: id='{}', kind='{}', name='{}'",
        profile.id, profile.kind, profile.name);
    println!("[dbquery] Profile connection config: {:?}", profile.connection);

    if profile.kind != "postgres" {
        return Err("Profile is not a PostgreSQL profile".to_string());
    }

    // Get password
    let password = get_profile_password(&profile);
    println!("[dbquery] Got password: {}", if password.is_some() { "yes (hidden)" } else { "no" });

    let conn_str = build_connection_string(&profile, password);
    // Log connection string but redact password
    let safe_conn_str = conn_str.split(' ')
        .map(|part| if part.starts_with("password=") { "password=***" } else { part })
        .collect::<Vec<_>>()
        .join(" ");
    println!("[dbquery] Connection string: {}", safe_conn_str);

    // Connect to database
    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| {
            println!("[dbquery] Connection failed: {:?}", e);
            format!("Failed to connect to database: {}", e)
        })?;

    // Spawn connection handler
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    // Build query - filter byte changes in SQL using get_byte_safe() for efficiency
    // This avoids fetching all rows and comparing in Rust
    let frame_id_i32 = frame_id as i32;
    let byte_index_i32 = byte_index as i32;

    // Build the base query that extracts and compares the specific byte in SQL
    let mut query = String::from(
        r#"
        WITH ordered_frames AS (
            SELECT
                ts,
                public.get_byte_safe(data_bytes, $3) as curr_byte,
                LAG(public.get_byte_safe(data_bytes, $3)) OVER (ORDER BY ts) as prev_byte
            FROM public.can_frame
            WHERE id = $1 AND extended = $2
        "#
    );

    // Add time range conditions to the CTE
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![&frame_id_i32, &is_extended, &byte_index_i32];

    if let Some(ref start) = start_time {
        let idx = params.len() + 1;
        query.push_str(&format!(" AND ts >= ${}::timestamptz", idx));
        params.push(start);
    }
    if let Some(ref end) = end_time {
        let idx = params.len() + 1;
        query.push_str(&format!(" AND ts < ${}::timestamptz", idx));
        params.push(end);
    }

    // Filter to only rows where the byte actually changed (in SQL, not Rust)
    query.push_str(
        r#"
            ORDER BY ts
        )
        SELECT
            (EXTRACT(EPOCH FROM ts) * 1000000)::float8 as timestamp_us,
            prev_byte,
            curr_byte
        FROM ordered_frames
        WHERE prev_byte IS NOT NULL
          AND curr_byte IS NOT NULL
          AND prev_byte IS DISTINCT FROM curr_byte
        ORDER BY ts
        LIMIT 10000
        "#
    );

    println!("[dbquery] Executing query:\n{}", query);
    println!("[dbquery] Query params: frame_id={}, is_extended={}, byte_index={}, start_time={:?}, end_time={:?}",
        frame_id_i32, is_extended, byte_index_i32, start_time, end_time);

    let rows = client
        .query(&query, &params)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows_scanned = rows.len();
    println!("[dbquery] Query returned {} change rows (filtered in SQL)", rows_scanned);

    // Parse results - byte comparison already done in SQL
    let mut results = Vec::new();
    for row in &rows {
        let timestamp_us: f64 = row.get("timestamp_us");
        let prev_byte: i32 = row.get("prev_byte");
        let curr_byte: i32 = row.get("curr_byte");

        results.push(ByteChangeResult {
            timestamp_us: timestamp_us as i64,
            old_value: prev_byte as u8,
            new_value: curr_byte as u8,
        });
    }

    let execution_time_ms = query_start.elapsed().as_millis() as u64;
    println!("[dbquery] Found {} byte changes at index {} (returned {} rows in {}ms)",
        results.len(), byte_index, rows_scanned, execution_time_ms);

    Ok(ByteChangeQueryResult {
        stats: QueryStats {
            rows_scanned,
            results_count: results.len(),
            execution_time_ms,
        },
        results,
    })
}

/// Query for frame payload changes
///
/// Returns a list of timestamps where any byte in the frame's payload changed.
#[tauri::command]
pub async fn db_query_frame_changes(
    app: AppHandle,
    profile_id: String,
    frame_id: u32,
    is_extended: bool,
    start_time: Option<String>,
    end_time: Option<String>,
) -> Result<FrameChangeQueryResult, String> {
    let query_start = std::time::Instant::now();
    println!("[dbquery] db_query_frame_changes called with profile_id='{}', frame_id={}, is_extended={}",
        profile_id, frame_id, is_extended);

    // Load settings to get profile
    let settings = load_settings(app).await.map_err(|e| format!("Failed to load settings: {}", e))?;

    let profile = find_profile(&settings, &profile_id)
        .ok_or_else(|| format!("Profile not found: {}", profile_id))?;

    println!("[dbquery] Found profile: id='{}', kind='{}', name='{}'",
        profile.id, profile.kind, profile.name);
    println!("[dbquery] Profile connection config: {:?}", profile.connection);

    if profile.kind != "postgres" {
        return Err("Profile is not a PostgreSQL profile".to_string());
    }

    // Get password
    let password = get_profile_password(&profile);
    println!("[dbquery] Got password: {}", if password.is_some() { "yes (hidden)" } else { "no" });

    let conn_str = build_connection_string(&profile, password);
    // Log connection string but redact password
    let safe_conn_str = conn_str.split(' ')
        .map(|part| if part.starts_with("password=") { "password=***" } else { part })
        .collect::<Vec<_>>()
        .join(" ");
    println!("[dbquery] Connection string: {}", safe_conn_str);

    // Connect to database
    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .map_err(|e| {
            println!("[dbquery] Connection failed: {:?}", e);
            format!("Failed to connect to database: {}", e)
        })?;

    // Spawn connection handler
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    // Build query - filter frame changes in SQL for efficiency
    // Only return rows where the payload differs from the previous frame
    let frame_id_i32 = frame_id as i32;

    let mut query = String::from(
        r#"
        WITH ordered_frames AS (
            SELECT
                ts,
                data_bytes,
                LAG(data_bytes) OVER (ORDER BY ts) as prev_data
            FROM public.can_frame
            WHERE id = $1 AND extended = $2
        "#
    );

    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = vec![&frame_id_i32, &is_extended];

    if let Some(ref start) = start_time {
        let idx = params.len() + 1;
        query.push_str(&format!(" AND ts >= ${}::timestamptz", idx));
        params.push(start);
    }
    if let Some(ref end) = end_time {
        let idx = params.len() + 1;
        query.push_str(&format!(" AND ts < ${}::timestamptz", idx));
        params.push(end);
    }

    // Filter to only rows where payload changed (bytea comparison in SQL)
    query.push_str(
        r#"
            ORDER BY ts
        )
        SELECT
            (EXTRACT(EPOCH FROM ts) * 1000000)::float8 as timestamp_us,
            prev_data,
            data_bytes
        FROM ordered_frames
        WHERE prev_data IS NOT NULL
          AND prev_data IS DISTINCT FROM data_bytes
        ORDER BY ts
        LIMIT 10000
        "#
    );

    println!("[dbquery] Executing query:\n{}", query);
    println!("[dbquery] Query params: frame_id={}, is_extended={}, start_time={:?}, end_time={:?}",
        frame_id_i32, is_extended, start_time, end_time);

    let rows = client
        .query(&query, &params)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let rows_scanned = rows.len();
    println!("[dbquery] Query returned {} change rows (filtered in SQL)", rows_scanned);

    // Parse results - only changed frames are returned
    let mut results = Vec::new();
    for row in &rows {
        let timestamp_us: f64 = row.get("timestamp_us");
        let prev_data: Vec<u8> = row.get("prev_data");
        let data_bytes: Vec<u8> = row.get("data_bytes");

        // Find changed indices
        let mut changed_indices = Vec::new();
        let max_len = prev_data.len().max(data_bytes.len());

        for i in 0..max_len {
            let prev_byte = prev_data.get(i).copied().unwrap_or(0);
            let curr_byte = data_bytes.get(i).copied().unwrap_or(0);
            if prev_byte != curr_byte {
                changed_indices.push(i);
            }
        }

        results.push(FrameChangeResult {
            timestamp_us: timestamp_us as i64,
            old_payload: prev_data,
            new_payload: data_bytes,
            changed_indices,
        });
    }

    let execution_time_ms = query_start.elapsed().as_millis() as u64;
    println!("[dbquery] Found {} frame changes (scanned {} rows in {}ms)",
        results.len(), rows_scanned, execution_time_ms);

    Ok(FrameChangeQueryResult {
        stats: QueryStats {
            rows_scanned,
            results_count: results.len(),
            execution_time_ms,
        },
        results,
    })
}
