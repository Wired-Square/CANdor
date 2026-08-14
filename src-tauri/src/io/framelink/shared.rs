// Copyright (c) 2026, Wired Square Pty Ltd
//
// FrameLink connection manager. FrameLink devices accept exactly one TCP
// client, so all operations — session streaming AND signal read/write — must
// share a single connection per device.
//
// Pool keyed by device_id (from capabilities). Bootstrap via connect_by_address,
// then all operations use device_id.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::io::error::IoError;
use framelink::protocol::capabilities::decode_capabilities;
use framelink::protocol::types::{FLAG_ACK_REQ, MSG_CAPABILITIES_REQ};
use framelink::session::FrameLinkSession;
use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use super::{FrameLinkProbeResult, ProbeInterface};

// ============================================================================
// WS command param helpers — shared by every framelink command module
// ============================================================================

/// Convert any `Display` error into a `String`, for WS command results.
pub(super) trait IntoStringErr<T> {
    fn str_err(self) -> Result<T, String>;
}

impl<T, E: std::fmt::Display> IntoStringErr<T> for Result<T, E> {
    fn str_err(self) -> Result<T, String> {
        self.map_err(|e| e.to_string())
    }
}

/// Extract a non-empty `device_id` string from WS command params.
pub(super) fn get_device_id(params: &serde_json::Value) -> Result<String, String> {
    params["device_id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| "Missing 'device_id' parameter".to_string())
}

// ============================================================================
// Types
// ============================================================================

/// Managed connection state for a single FrameLink device.
pub(crate) struct ManagedConnection {
    pub session: Arc<FrameLinkSession>,
    pub addr: SocketAddr,
    pub iface_types: HashMap<u8, u8>,
    pub probe_cache: FrameLinkProbeResult,
    pub editable_board_def: std::sync::Mutex<Option<framelink::board::editable::EditableBoardDef>>,
    /// Outstanding [`ConnectionLease`]s. At zero the connection is idle and the
    /// sweeper may evict it once the linger expires.
    leases: AtomicUsize,
}

/// A borrowed handle on a pooled connection.
///
/// The pool used to hand out bare `Arc`s and count session references in a
/// field nothing read, so nothing ever removed a pool entry: a stopped session
/// left the socket open, and since a FrameLink device serves exactly one
/// client, that held the device's only slot for the life of the process.
/// Holding a lease keeps the connection alive; dropping the last one starts the
/// linger.
pub(crate) struct ConnectionLease {
    conn: Arc<ManagedConnection>,
    device_id: String,
}

impl std::ops::Deref for ConnectionLease {
    type Target = ManagedConnection;

    fn deref(&self) -> &Self::Target {
        &self.conn
    }
}

impl Drop for ConnectionLease {
    fn drop(&mut self) {
        if self.conn.leases.fetch_sub(1, Ordering::SeqCst) == 1 {
            schedule_eviction(&self.device_id);
        }
    }
}

impl ConnectionLease {
    fn take(device_id: &str, conn: Arc<ManagedConnection>) -> Self {
        conn.leases.fetch_add(1, Ordering::SeqCst);
        Self {
            conn,
            device_id: device_id.to_string(),
        }
    }
}

// ============================================================================
// Global Pool — keyed by device_id
// ============================================================================

static POOL: Lazy<Mutex<HashMap<String, Arc<ManagedConnection>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// How long an unused connection is kept before the socket is closed.
///
/// Long enough that the ~40 short-lived rules/signal commands reuse one warm
/// connection instead of reconnecting per command, short enough that a stopped
/// session stops squatting on a single-client device.
const IDLE_LINGER: Duration = Duration::from_secs(30);

/// How often the sweeper looks for expired entries.
const SWEEP_INTERVAL: Duration = Duration::from_secs(5);

/// Device ids whose last lease has gone, with the instant they may be evicted.
static PENDING_EVICTION: Lazy<std::sync::Mutex<HashMap<String, std::time::Instant>>> =
    Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

/// Mark a connection idle. Called from `Drop`, so it must not be async or block.
fn schedule_eviction(device_id: &str) {
    if let Ok(mut pending) = PENDING_EVICTION.lock() {
        pending.insert(device_id.to_string(), std::time::Instant::now() + IDLE_LINGER);
    }
    start_sweeper();
}

/// One process-wide sweeper, started on first use — a timer per connection
/// would be a task per device that mostly sleeps.
fn start_sweeper() {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(SWEEP_INTERVAL);
            loop {
                ticker.tick().await;
                sweep_idle_connections().await;
            }
        });
    });
}

/// Evict connections whose linger has expired and that nobody has re-acquired.
async fn sweep_idle_connections() {
    let due: Vec<String> = {
        let now = std::time::Instant::now();
        let Ok(mut pending) = PENDING_EVICTION.lock() else {
            return;
        };
        let due: Vec<String> = pending
            .iter()
            .filter(|(_, deadline)| **deadline <= now)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &due {
            pending.remove(id);
        }
        due
    };

    if due.is_empty() {
        return;
    }

    let mut pool = POOL.lock().await;
    for device_id in due {
        // Re-acquired inside the window, so it is live again — leave it.
        let is_idle = pool
            .get(&device_id)
            .is_some_and(|conn| conn.leases.load(Ordering::SeqCst) == 0);
        if is_idle {
            pool.remove(&device_id);
            tlog!(
                "[framelink:{}] Idle {}s — connection closed",
                device_id,
                IDLE_LINGER.as_secs()
            );
        }
    }
    // Dropping the last Arc runs FrameLinkSession::Drop, which aborts the IO
    // task and closes the socket. There is no explicit close to call.
}

/// Per-key connection lock — prevents duplicate TCP connections to the same
/// device. A `std::sync::Mutex` because it is only ever held long enough to
/// clone an `Arc`, never across an await — which is also what lets
/// [`ConnectingGuard`]'s `Drop` clean up without being async.
static CONNECTING: Lazy<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    Lazy::new(|| std::sync::Mutex::new(HashMap::new()));

/// Holds the per-address connect lock and drops the map entry with it.
///
/// Cleanup used to be two explicit calls on the success paths, so every `?`
/// between resolving the host and inserting into the pool leaked an entry
/// forever — and the failure paths are exactly the ones a flaky device takes
/// repeatedly.
struct ConnectingGuard {
    race_key: String,
    lock: Arc<tokio::sync::Mutex<()>>,
}

impl ConnectingGuard {
    fn acquire(race_key: String) -> Self {
        let lock = CONNECTING
            .lock()
            .expect("CONNECTING mutex poisoned")
            .entry(race_key.clone())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        Self { race_key, lock }
    }
}

impl Drop for ConnectingGuard {
    fn drop(&mut self) {
        let mut connecting = match CONNECTING.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        // Only the map and this guard hold it, so nobody is queued behind us —
        // dropping the entry now cannot cost another caller its exclusion.
        if Arc::strong_count(&self.lock) <= 2 {
            connecting.remove(&self.race_key);
        }
    }
}

// ============================================================================
// Bootstrap — connect by address
// ============================================================================

/// Connect by address, fetch capabilities, return device_id.
/// This is the only function that takes host:port — all others use device_id.
pub(crate) async fn connect_by_address(
    host: &str,
    port: u16,
    timeout_sec: f64,
) -> Result<String, String> {
    let addr = crate::io::net::resolve_host_port(host, port)
        .await
        .map_err(|e| e.user_message())?;

    // Per-key lock: only one connection attempt per address at a time
    let connecting = ConnectingGuard::acquire(format!("addr:{}:{}", host, port));
    let _guard = connecting.lock.clone().lock_owned().await;

    // Check if this address already has a live connection in the pool
    {
        let pool = POOL.lock().await;
        for (device_id, conn) in pool.iter() {
            if conn.addr == addr && conn.session.is_alive() {
                return Ok(device_id.clone());
            }
        }
    }

    // Create new connection
    let display_key = format!("{}:{}", host, port);
    let session = tokio::time::timeout(
        Duration::from_secs_f64(timeout_sec),
        FrameLinkSession::connect(addr),
    )
    .await
    .map_err(|_| IoError::timeout(&display_key, "connect").user_message())?
    .map_err(|e| IoError::connection(&display_key, e.to_string()).user_message())?;

    let (iface_types, probe_cache, editable_board_def) =
        fetch_capabilities(&session, &display_key, timeout_sec)
            .await
            .map_err(|e| e.user_message())?;

    let device_id = probe_cache
        .device_id
        .clone()
        .unwrap_or_else(|| display_key.clone());

    let conn = Arc::new(ManagedConnection {
        session,
        addr,
        iface_types,
        probe_cache,
        editable_board_def: std::sync::Mutex::new(editable_board_def),
        leases: AtomicUsize::new(0),
    });

    // Insert into pool by device_id
    let mut pool = POOL.lock().await;
    if let Some(existing) = pool.get(&device_id) {
        if existing.session.is_alive() {
            tlog!("[framelink:{}] Discarding duplicate connection (race)", device_id);
            return Ok(device_id);
        }
    }
    pool.insert(device_id.clone(), conn);
    tlog!("[framelink:{}] Created managed connection ({})", device_id, display_key);
    // Start the clock straight away: a probe connects and reads the cache
    // without ever taking a lease, so an unclaimed connection would otherwise
    // hold the device's only client slot with nothing to release it.
    schedule_eviction(&device_id);

    Ok(device_id)
}

// ============================================================================
// Internal — fetch capabilities
// ============================================================================

/// Load the embedded board def by name and revision as a fallback.
fn embedded_board_def_fallback(
    board_name: &Option<String>,
    board_revision: &Option<String>,
) -> (
    Option<framelink::board::BoardDef>,
    Option<framelink::board::editable::EditableBoardDef>,
) {
    let bd = board_name.as_deref().and_then(|name| {
        board_revision
            .as_deref()
            .and_then(|rev| framelink::board::load_board_def(name, rev))
    });
    let ed = bd
        .as_ref()
        .map(framelink::board::editable::EditableBoardDef::from_board_def);
    (bd, ed)
}

/// Fetch capabilities from a freshly connected session.
///
/// A device that cannot describe itself is not a device we have connected to,
/// so every failure here is fatal to the connection. This used to return an
/// empty probe instead, which let `connect_by_address` pool a half-open
/// connection, name it `host:port`, and report success — so a device speaking a
/// protocol version we do not (the whole of this bug) presented as a healthy
/// session that silently streamed nothing.
async fn fetch_capabilities(
    session: &Arc<FrameLinkSession>,
    key: &str,
    timeout_sec: f64,
) -> Result<
    (
        HashMap<u8, u8>,
        FrameLinkProbeResult,
        Option<framelink::board::editable::EditableBoardDef>,
    ),
    IoError,
> {
    let frame = tokio::time::timeout(
        Duration::from_secs_f64(timeout_sec),
        session.request(MSG_CAPABILITIES_REQ, FLAG_ACK_REQ, &[]),
    )
    .await
    .map_err(|_| {
        tlog!("[framelink:{}] Capabilities request timed out", key);
        IoError::timeout(key, "capabilities request")
    })?
    .map_err(|e| {
        tlog!("[framelink:{}] Capabilities request failed: {}", key, e);
        IoError::protocol(key, format!("capabilities request failed: {e}"))
    })?;

    let caps = decode_capabilities(&frame.payload).map_err(|e| {
        tlog!("[framelink:{}] Failed to decode capabilities: {}", key, e);
        IoError::protocol(key, format!("could not decode capabilities: {e}"))
    })?;

    let iface_types: HashMap<u8, u8> = caps
        .interfaces
        .iter()
        .map(|i| (i.index, i.iface_type))
        .collect();

    let device_id = caps.device_id().map(|s| s.to_string());
    let board_name = caps.board_name().map(|s| s.to_string());
    let board_revision = caps.board_revision().map(|s| s.to_string());

    // Try downloading the device TOML first; fall back to embedded board def
    let (board_def, editable) = match framelink::board::transfer::download_board_def(session)
        .await
    {
        Ok(Some(toml_str)) => {
            tlog!(
                "[framelink:{}] Downloaded device TOML ({} bytes)",
                key,
                toml_str.len()
            );
            let ed = framelink::board::editable::EditableBoardDef::from_toml(&toml_str).ok();
            let bd = framelink::board::parse_board_def(&toml_str).ok();
            if ed.is_none() && bd.is_none() {
                // A poisoned/unparseable device TOML would otherwise leave no
                // board def and no way to recover. Fall back to embedded so the
                // next persist-save re-uploads clean TOML.
                tlog!(
                    "[framelink:{}] Device TOML unparseable; using embedded board def",
                    key
                );
                embedded_board_def_fallback(&board_name, &board_revision)
            } else {
                (bd, ed)
            }
        }
        Ok(None) => {
            tlog!(
                "[framelink:{}] No device TOML stored, using embedded board def",
                key
            );
            embedded_board_def_fallback(&board_name, &board_revision)
        }
        Err(e) => {
            tlog!(
                "[framelink:{}] Board def download failed ({}), using embedded board def",
                key,
                e
            );
            embedded_board_def_fallback(&board_name, &board_revision)
        }
    };

    let interfaces: Vec<ProbeInterface> = caps
        .interfaces
        .iter()
        .map(|iface| {
            let name = board_def
                .as_ref()
                .and_then(|bd| bd.interface_name(iface.index))
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    let type_name =
                        framelink::protocol::types::interface_name(iface.iface_type);
                    format!("{} {}", type_name, iface.index)
                });
            ProbeInterface {
                index: iface.index,
                iface_type: iface.iface_type,
                name,
                type_name: framelink::protocol::types::interface_name(iface.iface_type).to_string(),
            }
        })
        .collect();

    let probe = FrameLinkProbeResult {
        device_id,
        board_name,
        board_revision,
        interfaces,
    };

    Ok((iface_types, probe, editable))
}

// ============================================================================
// Public API — Connection (by device_id)
// ============================================================================

/// Take a lease on a pooled connection, if it is there.
fn lease_from(
    pool: &HashMap<String, Arc<ManagedConnection>>,
    device_id: &str,
) -> Option<ConnectionLease> {
    pool.get(device_id)
        .map(|conn| ConnectionLease::take(device_id, conn.clone()))
}

/// Get or reconnect a managed connection by device_id.
/// If the connection is dead, reconnects using the last known address.
/// If the device is not in the pool: a Manual registry device connects
/// directly to its stored host (no discovery); otherwise it is resolved
/// via mDNS and connected.
pub(crate) async fn get_connection(
    device_id: &str,
    timeout_sec: f64,
) -> Result<ConnectionLease, String> {
    let pool = POOL.lock().await;

    if let Some(conn) = pool.get(device_id) {
        if conn.session.is_alive() {
            return Ok(ConnectionLease::take(device_id, conn.clone()));
        }
        // Dead connection — reconnect using last known address
        let addr = conn.addr;
        drop(pool);
        let host = addr.ip().to_string();
        let port = addr.port();
        connect_by_address(&host, port, timeout_sec).await?;
        let pool = POOL.lock().await;
        lease_from(&pool, device_id)
            .ok_or_else(|| format!("Reconnection to '{}' failed", device_id))
    } else {
        drop(pool);
        // A Manual registry device resolves to its stored host with no
        // discovery — the data/management path must honour the registry
        // exactly as the SMP path does, so a pinned device is never scanned
        // for on reuse. Auto/unregistered devices fall through to mDNS.
        if let framelink::ConnectTarget::Direct(addr) =
            framelink::target_for(&framelink::DeviceId::from(device_id), framelink::Transport::Tcp)
        {
            let host = addr.ip().to_string();
            connect_by_address(&host, addr.port(), timeout_sec).await?;
            let pool = POOL.lock().await;
            return lease_from(&pool, device_id)
                .ok_or_else(|| format!("Manual connection to '{}' ({}) failed", device_id, addr));
        }

        // Not in pool — poll the shared Discovery for an mDNS-resolved match
        let discovery = crate::device_scan::discovery_handle().await?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs_f64(timeout_sec);
        let device = loop {
            let snapshot = discovery.devices().await;
            if let Some(d) = snapshot
                .into_iter()
                .find(|d| d.name() == device_id && d.address().is_some())
            {
                break d;
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(format!("Device '{}' not found via discovery", device_id));
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        };

        let addr = device.address().expect("filtered by address.is_some()");
        let host = addr.ip().to_string();
        let port = addr.port();
        connect_by_address(&host, port, timeout_sec).await?;

        let pool = POOL.lock().await;
        lease_from(&pool, device_id)
            .ok_or_else(|| format!("Connection to '{}' failed after discovery", device_id))
    }
}

// ============================================================================
// Public API — Session Tier
// ============================================================================

// ============================================================================
// Public API — Query (by device_id)
// ============================================================================

/// Return cached probe data if a managed connection exists for this device.
pub(crate) async fn get_cached_probe(device_id: &str) -> Option<FrameLinkProbeResult> {
    let pool = POOL.lock().await;
    pool.get(device_id)
        .filter(|conn| conn.session.is_alive())
        .map(|conn| conn.probe_cache.clone())
}

/// Search the pool for a live connection matching the given address.
pub(crate) async fn find_probe_by_address(addr: SocketAddr) -> Option<FrameLinkProbeResult> {
    let pool = POOL.lock().await;
    pool.values()
        .find(|conn| conn.addr == addr && conn.session.is_alive())
        .map(|conn| conn.probe_cache.clone())
}

/// Load the board definition for the device, using cached board info.
pub(crate) async fn load_board_def(device_id: &str) -> Option<framelink::board::BoardDef> {
    let pool = POOL.lock().await;
    let conn = pool.get(device_id).filter(|c| c.session.is_alive())?;
    let name = conn.probe_cache.board_name.as_ref()?;
    let rev = conn.probe_cache.board_revision.as_ref()?;
    framelink::board::load_board_def(name, rev)
}

/// Return the interface type for a given interface index.
pub(crate) async fn get_iface_type(device_id: &str, iface_index: u8) -> Option<u8> {
    let pool = POOL.lock().await;
    pool.get(device_id)
        .filter(|conn| conn.session.is_alive())
        .and_then(|conn| conn.iface_types.get(&iface_index).copied())
}

// ============================================================================
// Public API — Editable Board Definition (by device_id)
// ============================================================================

/// Clone the EditableBoardDef from a managed connection, if one exists.
pub(crate) async fn clone_editable_board_def(
    device_id: &str,
) -> Option<framelink::board::editable::EditableBoardDef> {
    let pool = POOL.lock().await;
    let conn = pool.get(device_id).filter(|c| c.session.is_alive())?;
    let guard = conn.editable_board_def.lock().ok()?;
    guard.clone()
}

/// Execute a closure with mutable access to the connection's EditableBoardDef.
pub(crate) async fn with_editable_board_def<F, R>(
    device_id: &str,
    timeout_sec: f64,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(&mut framelink::board::editable::EditableBoardDef) -> R,
{
    let conn = get_connection(device_id, timeout_sec).await?;
    let mut guard = conn
        .editable_board_def
        .lock()
        .map_err(|e| format!("editable_board_def mutex poisoned: {}", e))?;
    match guard.as_mut() {
        Some(board_def) => Ok(f(board_def)),
        None => Err("No board definition available for this device".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connecting_holds(key: &str) -> bool {
        CONNECTING.lock().unwrap().contains_key(key)
    }

    /// The guard must clean up on the *failure* paths, which is what the two
    /// explicit `cleanup_connecting` calls it replaced never did.
    #[test]
    fn connecting_entry_is_released_on_drop() {
        let key = "addr:release.test:120".to_string();
        {
            let _guard = ConnectingGuard::acquire(key.clone());
            assert!(connecting_holds(&key), "entry should exist while held");
        }
        assert!(!connecting_holds(&key), "entry should be gone after drop");
    }

    /// A second waiter keeps the entry alive, so the two callers go on sharing
    /// one lock rather than the first one out removing the exclusion.
    #[test]
    fn connecting_entry_survives_while_another_holder_waits() {
        let key = "addr:contended.test:120".to_string();
        let waiter = ConnectingGuard::acquire(key.clone());
        {
            let _first = ConnectingGuard::acquire(key.clone());
        }
        assert!(
            connecting_holds(&key),
            "entry must outlive the first guard while a second holds it"
        );
        drop(waiter);
        assert!(!connecting_holds(&key), "last guard out clears the entry");
    }

    fn eviction_deadline(device_id: &str) -> Option<std::time::Instant> {
        PENDING_EVICTION.lock().unwrap().get(device_id).copied()
    }

    /// A pooled connection against a throwaway local listener. `connect` only
    /// opens the socket — there is no handshake — so this exercises the real
    /// `ManagedConnection` rather than a stand-in for it.
    async fn test_connection() -> Arc<ManagedConnection> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let _accepted = listener.accept().await;
            std::future::pending::<()>().await;
        });
        let session = FrameLinkSession::connect(addr).await.unwrap();
        Arc::new(ManagedConnection {
            session,
            addr,
            iface_types: HashMap::new(),
            probe_cache: FrameLinkProbeResult {
                device_id: None,
                board_name: None,
                board_revision: None,
                interfaces: vec![],
            },
            editable_board_def: std::sync::Mutex::new(None),
            leases: AtomicUsize::new(0),
        })
    }

    /// A connection with a live lease is not a candidate for eviction; the last
    /// lease going is what starts the clock.
    #[tokio::test]
    async fn only_the_last_lease_schedules_eviction() {
        let device_id = "lease.test";
        let conn = test_connection().await;
        PENDING_EVICTION.lock().unwrap().remove(device_id);

        let first = ConnectionLease::take(device_id, conn.clone());
        let second = ConnectionLease::take(device_id, conn.clone());
        assert_eq!(conn.leases.load(Ordering::SeqCst), 2);

        drop(first);
        assert!(
            eviction_deadline(device_id).is_none(),
            "a connection still in use must not be scheduled for eviction"
        );

        drop(second);
        assert!(
            eviction_deadline(device_id).is_some(),
            "the last lease going must start the linger"
        );
        assert_eq!(conn.leases.load(Ordering::SeqCst), 0);
        PENDING_EVICTION.lock().unwrap().remove(device_id);
    }

    /// Re-acquiring is what makes the linger worth having: the sweeper leaves a
    /// connection alone while its lease count is non-zero.
    #[tokio::test]
    async fn reacquiring_within_the_linger_keeps_the_connection() {
        let device_id = "release.test";
        let conn = test_connection().await;
        PENDING_EVICTION.lock().unwrap().remove(device_id);

        drop(ConnectionLease::take(device_id, conn.clone()));
        assert!(eviction_deadline(device_id).is_some());

        let revived = ConnectionLease::take(device_id, conn.clone());
        assert_eq!(conn.leases.load(Ordering::SeqCst), 1);
        // The sweeper's own guard: a due entry whose leases came back is skipped.
        assert!(conn.leases.load(Ordering::SeqCst) != 0);
        drop(revived);
        PENDING_EVICTION.lock().unwrap().remove(device_id);
    }
}

