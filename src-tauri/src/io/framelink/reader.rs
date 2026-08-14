// Copyright (c) 2026, Wired Square Pty Ltd
//
// FrameLink source reader — subscribes to the shared connection for a device
// and forwards frames matching this source's bus mappings to the merge task.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::mpsc;

use super::convert_stream_frame;
use super::shared;
use crate::io::error::IoError;
use crate::io::gvret::BusMapping;
use crate::io::types::{SourceMessage, TransmitRequest};

/// Frames buffered before a flush, independent of the 1 ms tick.
const MAX_PENDING_FRAMES: usize = 256;

/// How long to wait for the device to acknowledge STREAM_STOP on teardown.
const STOP_STREAM_TIMEOUT: Duration = Duration::from_millis(500);

/// Run a FrameLink source reader for a single interface (or set of interfaces).
///
/// Acquires the shared connection for the device (creating it if this is the
/// first source), receives stream frames, and forwards those that match this
/// source's bus mappings to the merge task.
pub async fn run_source(
    source_idx: usize,
    host: String,
    port: u16,
    timeout_sec: f64,
    bus_mappings: Vec<BusMapping>,
    stop_flag: Arc<AtomicBool>,
    tx: mpsc::Sender<SourceMessage>,
) {
    // Bootstrap: connect by address to get device_id
    let device_id = match shared::connect_by_address(&host, port, timeout_sec).await {
        Ok(id) => id,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(source_idx, e))
                .await;
            return;
        }
    };

    // The lease lives as long as this reader; dropping it starts the pool's
    // idle linger, which is what finally closes the socket.
    let conn = match shared::get_connection(&device_id, timeout_sec).await {
        Ok(c) => c,
        Err(e) => {
            let _ = tx
                .send(SourceMessage::Error(source_idx, e))
                .await;
            return;
        }
    };

    for mapping in &bus_mappings {
        if mapping.enabled {
            let _ = conn.session.start_stream(mapping.device_bus).await;
        }
    }

    let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
    let _ = tx
        .send(SourceMessage::TransmitReady(source_idx, transmit_tx))
        .await;

    let _ = tx
        .send(SourceMessage::Connected(
            source_idx,
            "framelink".to_string(),
            format!("{}:{}", host, port),
            None,
        ))
        .await;

    tlog!(
        "[framelink] Source {} using shared connection to {}:{}, {} bus mappings",
        source_idx,
        host,
        port,
        bus_mappings.len()
    );

    let my_interfaces: std::collections::HashSet<u8> = bus_mappings
        .iter()
        .filter(|m| m.enabled)
        .map(|m| m.device_bus)
        .collect();

    // Frames are accumulated and flushed on the tick below rather than sent one
    // at a time. The device batches its FRAME_RX messages and the library hands
    // them over individually, so a per-frame send would allocate a Vec, wake the
    // merge task and take a channel slot thousands of times a second — every
    // other high-rate driver flushes once per read. The merge task only emits
    // every 50 ms, so this costs no latency.
    let mut pending: Vec<crate::io::FrameMessage> = Vec::new();
    let mut poll_interval = tokio::time::interval(Duration::from_millis(1));

    loop {
        tokio::select! {
            result = conn.session.recv_stream_frame() => {
                match result {
                    Some(sf) => {
                        if !my_interfaces.contains(&sf.iface_index) {
                            continue;
                        }
                        if let Some(msg) =
                            convert_stream_frame(&sf, &bus_mappings, &conn.iface_types)
                        {
                            pending.push(msg);
                            if pending.len() >= MAX_PENDING_FRAMES {
                                let _ = tx
                                    .send(SourceMessage::Frames(source_idx, std::mem::take(&mut pending)))
                                    .await;
                            }
                        }
                    }
                    None => {
                        // An unasked-for close is a fault, not an ending. Ended
                        // reaches the merge task and stops there, so reporting
                        // one here meant a device that dropped mid-session was
                        // invisible until every other source had gone too.
                        let _ = tx
                            .send(SourceMessage::Error(
                                source_idx,
                                IoError::DeviceDisconnected { device: device_id.clone() }
                                    .user_message(),
                            ))
                            .await;
                        return;
                    }
                }
            }
            _ = poll_interval.tick() => {
                if !pending.is_empty() {
                    let _ = tx
                        .send(SourceMessage::Frames(source_idx, std::mem::take(&mut pending)))
                        .await;
                }
                if stop_flag.load(Ordering::SeqCst) {
                    break;
                }
                while let Ok(req) = transmit_rx.try_recv() {
                    let result = conn
                        .session
                        .transmit(&req.data)
                        .await
                        .map_err(|e| e.to_string());
                    let _ = req.result_tx.send(result);
                }
            }
        }
    }

    if !pending.is_empty() {
        let _ = tx
            .send(SourceMessage::Frames(source_idx, pending))
            .await;
    }

    // Tell the device to stop sending before letting go: the connection may
    // linger for another consumer, and nothing here would read those frames.
    // Bounded, because STREAM_STOP is sent without an ACK flag and the library
    // still waits out its 15s command timeout for a reply that never comes —
    // unbounded, that would stall session stop by 15s per interface.
    for iface in &my_interfaces {
        let _ = tokio::time::timeout(STOP_STREAM_TIMEOUT, conn.session.stop_stream(*iface)).await;
    }

    let _ = tx
        .send(SourceMessage::Ended(source_idx, "stopped".to_string()))
        .await;
}
