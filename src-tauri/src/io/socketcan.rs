// ui/src-tauri/src/io/socketcan_reader.rs
//
// SocketCAN reader for Linux native CAN interfaces.
// Used with CANable Pro (Candlelight firmware) or native CAN hardware.
//
// Requires the interface to be configured first:
//   sudo ip link set can0 up type can bitrate 500000
//
// This module is only compiled on Linux.

#[cfg(target_os = "linux")]
mod linux_impl {
    use serde::{Deserialize, Serialize};
    use socketcan::{CanDataFrame, CanSocket, EmbeddedFrame, ExtendedId, Frame, Id, Socket, StandardId};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc as std_mpsc,
        Arc,
    };
    use std::time::Duration;
    use tokio::sync::mpsc;

    use crate::io::gvret_common::{apply_bus_mapping, BusMapping};
    use crate::io::types::{io_error, SourceMessage, TransmitRequest};
    use crate::io::{now_us, CanTransmitFrame, FrameMessage};

    // ============================================================================
    // Types and Configuration
    // ============================================================================

    /// SocketCAN reader configuration
    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SocketCanConfig {
        /// CAN interface name (e.g., "can0", "vcan0")
        pub interface: String,
        /// Maximum number of frames to read (None = unlimited)
        pub limit: Option<i64>,
        /// Display name for the reader
        pub display_name: Option<String>,
        /// Bus number override - assigns a specific bus number to all frames from this device.
        /// Used for multi-bus capture where multiple single-bus devices are combined.
        /// If None, defaults to bus 0.
        #[serde(default)]
        pub bus_override: Option<u8>,
    }

    // ============================================================================
    // Utility Functions
    // ============================================================================

    /// Convert a socketcan frame to our FrameMessage format
    fn convert_socketcan_frame(frame: &socketcan::CanFrame, bus_override: Option<u8>) -> FrameMessage {
        FrameMessage {
            protocol: "can".to_string(),
            timestamp_us: now_us(),
            frame_id: frame.raw_id() & 0x1FFF_FFFF,
            bus: bus_override.unwrap_or(0),
            dlc: frame.len() as u8,
            bytes: frame.data().to_vec(),
            is_extended: frame.is_extended(),
            is_fd: false, // TODO: CAN FD support
            source_address: None,
            incomplete: None,
            direction: None,
        }
    }

    // ============================================================================
    // Simple SocketCAN Reader (for multi_source.rs)
    // ============================================================================

    /// Simple SocketCAN reader/writer for use in multi-source mode.
    /// Wraps a CanSocket for both reading and writing frames.
    pub struct SocketCanReader {
        socket: CanSocket,
    }

    impl SocketCanReader {
        /// Create a new SocketCAN reader for the given interface
        pub fn new(interface: &str) -> Result<Self, String> {
            let device = format!("socketcan({})", interface);
            let socket = CanSocket::open(interface)
                .map_err(|e| io_error(&device, "open", e))?;

            // Set read timeout for non-blocking reads
            socket
                .set_read_timeout(Duration::from_millis(100))
                .map_err(|e| io_error(&device, "set read timeout", e))?;

            Ok(Self { socket })
        }

        /// Read a frame with timeout, returns None on timeout
        pub fn read_frame_timeout(&self, _timeout: Duration) -> Result<Option<FrameMessage>, String> {
            // Note: timeout is already set in constructor, parameter kept for API compatibility
            match self.socket.read_frame() {
                Ok(frame) => Ok(Some(convert_socketcan_frame(&frame, None))),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(None),
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(None),
                Err(e) => Err(format!("Read error: {}", e)),
            }
        }

        /// Write a raw CAN frame (16-byte struct can_frame format)
        pub fn write_frame(&self, data: &[u8]) -> Result<(), String> {
            use socketcan::{CanDataFrame, ExtendedId, StandardId, Id};

            if data.len() < 16 {
                return Err("Frame data too short".to_string());
            }

            // Parse struct can_frame layout: can_id (4), dlc (1), padding (3), data (8)
            let can_id = u32::from_ne_bytes([data[0], data[1], data[2], data[3]]);
            let dlc = data[4] as usize;
            let frame_data = &data[8..8 + dlc.min(8)];

            // Check flags in can_id
            let is_extended = (can_id & 0x8000_0000) != 0; // CAN_EFF_FLAG
            let raw_id = can_id & 0x1FFF_FFFF;

            // Build the frame
            let frame = if is_extended {
                let id = ExtendedId::new(raw_id)
                    .ok_or_else(|| format!("Invalid extended ID: 0x{:08X}", raw_id))?;
                CanDataFrame::new(Id::Extended(id), frame_data)
                    .ok_or_else(|| "Failed to create extended frame".to_string())?
            } else {
                let id = StandardId::new(raw_id as u16)
                    .ok_or_else(|| format!("Invalid standard ID: 0x{:03X}", raw_id))?;
                CanDataFrame::new(Id::Standard(id), frame_data)
                    .ok_or_else(|| "Failed to create standard frame".to_string())?
            };

            self.socket
                .write_frame(&frame)
                .map_err(|e| format!("Write error: {}", e))?;

            Ok(())
        }
    }

    // ============================================================================
    // Multi-Source Streaming
    // ============================================================================

    /// Encode a CAN frame for SocketCAN (struct can_frame format, 16 bytes)
    pub fn encode_frame(frame: &CanTransmitFrame) -> [u8; 16] {
        let mut buf = [0u8; 16];

        // can_id with flags
        let mut can_id = frame.frame_id;
        if frame.is_extended {
            can_id |= 0x8000_0000; // CAN_EFF_FLAG
        }
        if frame.is_rtr {
            can_id |= 0x4000_0000; // CAN_RTR_FLAG
        }

        buf[0..4].copy_from_slice(&can_id.to_ne_bytes());
        buf[4] = frame.data.len().min(8) as u8; // DLC
        // bytes 5-7 are padding

        // Data (up to 8 bytes)
        let len = frame.data.len().min(8);
        buf[8..8 + len].copy_from_slice(&frame.data[..len]);

        buf
    }

    /// Run SocketCAN source and send frames to merge task
    pub async fn run_source(
        source_idx: usize,
        interface: String,
        bus_mappings: Vec<BusMapping>,
        stop_flag: Arc<AtomicBool>,
        tx: mpsc::Sender<SourceMessage>,
    ) {
        let device = format!("socketcan({})", interface);

        // Open socket
        let socket = match CanSocket::open(&interface) {
            Ok(s) => s,
            Err(e) => {
                let _ = tx
                    .send(SourceMessage::Error(
                        source_idx,
                        io_error(&device, "open", e),
                    ))
                    .await;
                return;
            }
        };

        // Set read timeout
        if let Err(e) = socket.set_read_timeout(Duration::from_millis(50)) {
            eprintln!("[socketcan] Warning: could not set read timeout: {}", e);
        }

        // Create transmit channel
        let (transmit_tx, transmit_rx) = std_mpsc::sync_channel::<TransmitRequest>(32);
        let _ = tx
            .send(SourceMessage::TransmitReady(source_idx, transmit_tx))
            .await;

        eprintln!(
            "[socketcan] Source {} connected to {}",
            source_idx, interface
        );

        // Read loop (blocking)
        let tx_clone = tx.clone();
        let stop_flag_clone = stop_flag.clone();

        let blocking_handle = tokio::task::spawn_blocking(move || {
            while !stop_flag_clone.load(Ordering::Relaxed) {
                // Check for transmit requests
                while let Ok(req) = transmit_rx.try_recv() {
                    let result = (|| {
                        if req.data.len() < 16 {
                            return Err("Frame data too short".to_string());
                        }

                        // Parse struct can_frame
                        let can_id = u32::from_ne_bytes([req.data[0], req.data[1], req.data[2], req.data[3]]);
                        let dlc = req.data[4] as usize;
                        let frame_data = &req.data[8..8 + dlc.min(8)];

                        let is_extended = (can_id & 0x8000_0000) != 0;
                        let raw_id = can_id & 0x1FFF_FFFF;

                        let frame = if is_extended {
                            let id = ExtendedId::new(raw_id)
                                .ok_or_else(|| format!("Invalid extended ID: 0x{:08X}", raw_id))?;
                            CanDataFrame::new(Id::Extended(id), frame_data)
                                .ok_or_else(|| "Failed to create extended frame".to_string())?
                        } else {
                            let id = StandardId::new(raw_id as u16)
                                .ok_or_else(|| format!("Invalid standard ID: 0x{:03X}", raw_id))?;
                            CanDataFrame::new(Id::Standard(id), frame_data)
                                .ok_or_else(|| "Failed to create standard frame".to_string())?
                        };

                        socket.write_frame(&frame)
                            .map_err(|e| format!("Write error: {}", e))
                    })();

                    let _ = req.result_tx.send(result);
                }

                // Read frame
                match socket.read_frame() {
                    Ok(frame) => {
                        let mut frame_msg = FrameMessage {
                            protocol: "can".to_string(),
                            timestamp_us: now_us(),
                            frame_id: frame.raw_id() & 0x1FFF_FFFF,
                            bus: 0,
                            dlc: frame.len() as u8,
                            bytes: frame.data().to_vec(),
                            is_extended: frame.is_extended(),
                            is_fd: false,
                            source_address: None,
                            incomplete: None,
                            direction: None,
                        };

                        if apply_bus_mapping(&mut frame_msg, &bus_mappings) {
                            let _ = tx_clone
                                .blocking_send(SourceMessage::Frames(source_idx, vec![frame_msg]));
                        }
                    }
                    Err(ref e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            || e.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        // Timeout - continue
                    }
                    Err(e) => {
                        let _ = tx_clone.blocking_send(SourceMessage::Error(
                            source_idx,
                            format!("Read error: {}", e),
                        ));
                        return;
                    }
                }
            }

            let _ = tx_clone.blocking_send(SourceMessage::Ended(source_idx, "stopped".to_string()));
        });

        let _ = blocking_handle.await;
    }
}

// Re-export for Linux
#[cfg(target_os = "linux")]
pub use linux_impl::{encode_frame, run_source, SocketCanConfig, SocketCanReader};

// ============================================================================
// Non-Linux Stub
// ============================================================================

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
mod stub {
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tokio::sync::mpsc;

    use crate::io::gvret_common::BusMapping;
    use crate::io::types::SourceMessage;
    use crate::io::CanTransmitFrame;

    /// SocketCAN configuration (stub for non-Linux)
    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct SocketCanConfig {
        pub interface: String,
        pub limit: Option<i64>,
        pub display_name: Option<String>,
        #[serde(default)]
        pub bus_override: Option<u8>,
    }

    /// Stub encode_frame for non-Linux (not actually usable)
    pub fn encode_frame(_frame: &CanTransmitFrame) -> [u8; 16] {
        [0u8; 16]
    }

    /// Stub run_source for non-Linux
    pub async fn run_source(
        source_idx: usize,
        _interface: String,
        _bus_mappings: Vec<BusMapping>,
        _stop_flag: Arc<AtomicBool>,
        tx: mpsc::Sender<SourceMessage>,
    ) {
        let _ = tx
            .send(SourceMessage::Error(
                source_idx,
                "SocketCAN is only available on Linux".to_string(),
            ))
            .await;
    }
}

#[cfg(not(target_os = "linux"))]
#[allow(unused_imports)]
pub use stub::{encode_frame, run_source, SocketCanConfig};
