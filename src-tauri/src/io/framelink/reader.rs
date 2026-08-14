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
use framelink::protocol::types::{IFACE_CAN, IFACE_CANFD, IFACE_RS232, IFACE_RS485};

use crate::io::error::IoError;
use crate::io::gvret::BusMapping;
use crate::io::types::{SourceMessage, TransmitRequest};
use crate::io::{InterfaceTraits, Protocol, TemporalMode};

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

    // The mappings handed to us were built before any connection existed, from
    // an `interfaces[]` array the profile may never have been given. Reconcile
    // against what the device actually reports.
    let bus_mappings = reconcile_bus_mappings(&bus_mappings, &conn.iface_types);

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
                            let _ = tx
                                .send(SourceMessage::Frames(source_idx, vec![msg]))
                                .await;
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

    // Tell the device to stop sending before letting go: the connection may
    // linger for another consumer, and nothing here would read those frames.
    for iface in &my_interfaces {
        let _ = conn.session.stop_stream(*iface).await;
    }

    let _ = tx
        .send(SourceMessage::Ended(source_idx, "stopped".to_string()))
        .await;
}

/// Build the bus mappings a session actually streams, from the interfaces the
/// device reports plus whatever the profile has to say about them.
///
/// `create_default_bus_mapping` runs before a connection exists, so it can only
/// read the profile's `interfaces[]` — an array the frontend populates from a
/// probe. When that probe never succeeded the array is absent and the mapping
/// falls back to a single hardcoded `can0`, which is how a two-interface device
/// came up with one CAN bus. The device is the authority on which interfaces
/// exist; the profile only says what to do with them.
fn reconcile_bus_mappings(
    profile_mappings: &[BusMapping],
    iface_types: &std::collections::HashMap<u8, u8>,
) -> Vec<BusMapping> {
    // Nothing to reconcile against — the device told us nothing, so honour the
    // profile as-is rather than silently streaming nothing.
    if iface_types.is_empty() {
        return profile_mappings.to_vec();
    }

    let mut indices: Vec<u8> = iface_types.keys().copied().collect();
    indices.sort_unstable();

    indices
        .into_iter()
        .enumerate()
        .map(|(slot, device_bus)| {
            let iface_type = iface_types.get(&device_bus).copied().unwrap_or(IFACE_CAN);
            let override_for = profile_mappings.iter().find(|m| m.device_bus == device_bus);
            BusMapping {
                device_bus,
                // An interface the profile has never heard of streams by default;
                // one it has been told to mute stays muted.
                enabled: override_for.map(|m| m.enabled).unwrap_or(true),
                output_bus: override_for
                    .map(|m| m.output_bus)
                    .unwrap_or(slot as u8),
                interface_id: interface_id_for(device_bus, iface_type),
                traits: Some(traits_for(iface_type)),
            }
        })
        .collect()
}

/// `can0` / `serial1` — the identifier shape the session picker displays.
fn interface_id_for(index: u8, iface_type: u8) -> String {
    match iface_type {
        IFACE_RS485 | IFACE_RS232 => format!("serial{index}"),
        _ => format!("can{index}"),
    }
}

fn traits_for(iface_type: u8) -> InterfaceTraits {
    let (protocols, tx_frames, tx_bytes) = match iface_type {
        IFACE_RS485 | IFACE_RS232 => (vec![Protocol::Serial], false, true),
        IFACE_CANFD => (vec![Protocol::Can, Protocol::CanFd], true, false),
        _ => (vec![Protocol::Can], true, false),
    };
    InterfaceTraits {
        temporal_mode: TemporalMode::Realtime,
        protocols,
        tx_frames,
        tx_bytes,
        multi_source: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn mapping(device_bus: u8, enabled: bool, output_bus: u8) -> BusMapping {
        BusMapping {
            device_bus,
            enabled,
            output_bus,
            interface_id: String::new(),
            traits: None,
        }
    }

    /// The case this whole change exists for: a profile whose probe never ran
    /// carries one hardcoded can0, and the device has two interfaces.
    #[test]
    fn a_device_interface_the_profile_never_saw_still_streams() {
        let iface_types = HashMap::from([(0u8, IFACE_CAN), (1u8, IFACE_CAN)]);
        let mappings = reconcile_bus_mappings(&[mapping(0, true, 0)], &iface_types);

        assert_eq!(mappings.len(), 2, "both device interfaces should be mapped");
        assert!(mappings.iter().all(|m| m.enabled));
        assert_eq!(mappings[1].device_bus, 1);
        assert_eq!(mappings[1].interface_id, "can1");
    }

    #[test]
    fn the_profile_still_decides_enabled_and_output_bus() {
        let iface_types = HashMap::from([(0u8, IFACE_CAN), (1u8, IFACE_CAN)]);
        let mappings =
            reconcile_bus_mappings(&[mapping(0, false, 7), mapping(1, true, 9)], &iface_types);

        assert!(!mappings[0].enabled, "a muted interface stays muted");
        assert_eq!(mappings[0].output_bus, 7);
        assert_eq!(mappings[1].output_bus, 9);
    }

    #[test]
    fn an_interface_the_device_does_not_have_is_dropped() {
        let iface_types = HashMap::from([(0u8, IFACE_CAN)]);
        let mappings =
            reconcile_bus_mappings(&[mapping(0, true, 0), mapping(3, true, 3)], &iface_types);

        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].device_bus, 0);
    }

    /// An RS-485 interface must come back as a serial bus, not a CAN one, or the
    /// session advertises the wrong protocol for it.
    #[test]
    fn interface_type_decides_the_id_and_traits() {
        let iface_types = HashMap::from([(0u8, IFACE_CAN), (1u8, IFACE_RS485)]);
        let mappings = reconcile_bus_mappings(&[], &iface_types);

        assert_eq!(mappings[1].interface_id, "serial1");
        let traits = mappings[1].traits.as_ref().unwrap();
        assert_eq!(traits.protocols, vec![Protocol::Serial]);
        assert!(traits.tx_bytes && !traits.tx_frames);
    }

    /// A device that reported nothing must not silently zero the session.
    #[test]
    fn no_device_interfaces_leaves_the_profile_alone() {
        let mappings = reconcile_bus_mappings(&[mapping(2, true, 5)], &HashMap::new());
        assert_eq!(mappings.len(), 1);
        assert_eq!(mappings[0].device_bus, 2);
        assert_eq!(mappings[0].output_bus, 5);
    }
}
