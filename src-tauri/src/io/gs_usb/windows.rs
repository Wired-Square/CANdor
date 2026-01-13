// src-tauri/src/io/gs_usb/windows.rs
//
// gs_usb reader implementation for Windows using nusb crate.
//
// On Windows, there's no kernel driver for gs_usb devices, so we access
// the USB device directly using nusb for control and bulk transfers.

use async_trait::async_trait;
use nusb::transfer::{ControlIn, ControlOut, ControlType, Recipient, RequestBuffer};
use nusb::Interface;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;

use super::{
    can_id_flags, can_mode, get_bittiming_for_bitrate, GsDeviceBittiming, GsDeviceConfig,
    GsDeviceMode, GsHostFrame, GsUsbBreq, GsUsbConfig, GsUsbDeviceInfo, GsUsbProbeResult,
    GS_USB_HOST_FORMAT, GS_USB_PIDS, GS_USB_VID,
};
use crate::buffer_store::{self, BufferType};
use crate::io::{
    emit_frames, emit_to_session, now_us, CanTransmitFrame, FrameMessage, IOCapabilities,
    IODevice, IOState, StreamEndedPayload, TransmitResult,
};

// ============================================================================
// Device Enumeration
// ============================================================================

/// List all gs_usb devices on the system (Windows implementation)
pub fn list_devices() -> Result<Vec<GsUsbDeviceInfo>, String> {
    let devices: Vec<GsUsbDeviceInfo> = nusb::list_devices()
        .map_err(|e| format!("Failed to list USB devices: {}", e))?
        .filter(|dev| {
            dev.vendor_id() == GS_USB_VID && GS_USB_PIDS.contains(&dev.product_id())
        })
        .map(|dev| GsUsbDeviceInfo {
            bus: dev.bus_number(),
            address: dev.device_address(),
            product: dev.product_string().unwrap_or_default().to_string(),
            serial: dev.serial_number().map(|s| s.to_string()),
            interface_name: None, // Windows doesn't have SocketCAN
            interface_up: None,
        })
        .collect();

    Ok(devices)
}

/// Probe a specific gs_usb device to get its capabilities
pub fn probe_device(bus: u8, address: u8) -> Result<GsUsbProbeResult, String> {
    // Find the device
    let device_info = nusb::list_devices()
        .map_err(|e| format!("Failed to list USB devices: {}", e))?
        .find(|dev| {
            dev.bus_number() == bus
                && dev.device_address() == address
                && dev.vendor_id() == GS_USB_VID
                && GS_USB_PIDS.contains(&dev.product_id())
        })
        .ok_or_else(|| "Device not found".to_string())?;

    // Open the device
    let device = device_info
        .open()
        .map_err(|e| format!("Failed to open device: {}", e))?;

    // Claim interface 0
    let interface = device
        .claim_interface(0)
        .map_err(|e| format!("Failed to claim interface: {}", e))?;

    // Query device config
    let config = get_device_config_sync(&interface)?;

    Ok(GsUsbProbeResult {
        success: true,
        channel_count: Some(config.icount),
        sw_version: Some(config.sw_version),
        hw_version: Some(config.hw_version),
        can_clock: None, // Would need to query BT_CONST
        supports_fd: None,
        error: None,
    })
}

/// Synchronously get device configuration
fn get_device_config_sync(interface: &Interface) -> Result<GsDeviceConfig, String> {
    // Use futures_lite to block on the async operation
    futures_lite::future::block_on(async {
        let mut buf = [0u8; GsDeviceConfig::SIZE];
        let result = interface
            .control_in(ControlIn {
                control_type: ControlType::Vendor,
                recipient: Recipient::Interface,
                request: GsUsbBreq::DeviceConfig as u8,
                value: 1,
                index: 0,
                length: GsDeviceConfig::SIZE as u16,
            })
            .await;

        match result.status {
            Ok(()) => {
                let data = result.data;
                if data.len() >= GsDeviceConfig::SIZE {
                    buf.copy_from_slice(&data[..GsDeviceConfig::SIZE]);
                    Ok(unsafe { std::ptr::read_unaligned(buf.as_ptr() as *const GsDeviceConfig) })
                } else {
                    Err(format!(
                        "Incomplete response: got {} bytes, expected {}",
                        data.len(),
                        GsDeviceConfig::SIZE
                    ))
                }
            }
            Err(e) => Err(format!("Control transfer failed: {:?}", e)),
        }
    })
}

// ============================================================================
// GsUsbReader Implementation
// ============================================================================

/// gs_usb reader for Windows
pub struct GsUsbReader {
    app: AppHandle,
    session_id: String,
    config: GsUsbConfig,
    state: IOState,
    cancel_flag: Arc<AtomicBool>,
    task_handle: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl GsUsbReader {
    pub fn new(app: AppHandle, session_id: String, config: GsUsbConfig) -> Self {
        Self {
            app,
            session_id,
            config,
            state: IOState::Stopped,
            cancel_flag: Arc::new(AtomicBool::new(false)),
            task_handle: None,
        }
    }
}

#[async_trait]
impl IODevice for GsUsbReader {
    fn capabilities(&self) -> IOCapabilities {
        IOCapabilities {
            can_pause: false,
            supports_time_range: false,
            is_realtime: true,
            supports_speed_control: false,
            supports_seek: false,
            can_transmit: !self.config.listen_only,
            can_transmit_serial: false,
            supports_canfd: false, // Could add later
            supports_extended_id: true,
            supports_rtr: true,
            available_buses: vec![self.config.channel],
        }
    }

    async fn start(&mut self) -> Result<(), String> {
        if self.state == IOState::Running {
            return Err("Reader is already running".to_string());
        }

        self.state = IOState::Starting;
        self.cancel_flag.store(false, Ordering::Relaxed);

        let app = self.app.clone();
        let session_id = self.session_id.clone();
        let config = self.config.clone();
        let cancel_flag = self.cancel_flag.clone();

        let handle = spawn_gs_usb_stream(app, session_id, config, cancel_flag);
        self.task_handle = Some(handle);
        self.state = IOState::Running;

        Ok(())
    }

    async fn stop(&mut self) -> Result<(), String> {
        self.cancel_flag.store(true, Ordering::Relaxed);

        if let Some(handle) = self.task_handle.take() {
            let _ = handle.await;
        }

        self.state = IOState::Stopped;
        Ok(())
    }

    async fn pause(&mut self) -> Result<(), String> {
        Err("gs_usb is a live stream and cannot be paused.".to_string())
    }

    async fn resume(&mut self) -> Result<(), String> {
        Err("gs_usb is a live stream and does not support pause/resume.".to_string())
    }

    fn set_speed(&mut self, _speed: f64) -> Result<(), String> {
        Err("gs_usb is a live stream and does not support speed control.".to_string())
    }

    fn set_time_range(
        &mut self,
        _start: Option<String>,
        _end: Option<String>,
    ) -> Result<(), String> {
        Err("gs_usb is a live stream and does not support time range filtering.".to_string())
    }

    fn state(&self) -> IOState {
        self.state.clone()
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn transmit_frame(&self, _frame: &CanTransmitFrame) -> Result<TransmitResult, String> {
        if self.config.listen_only {
            return Err(
                "Cannot transmit in listen-only mode. Disable listen-only in profile settings."
                    .to_string(),
            );
        }
        // TODO: Implement TX via bulk OUT endpoint
        Err("Transmission not yet implemented for gs_usb".to_string())
    }
}

// ============================================================================
// Stream Implementation
// ============================================================================

fn spawn_gs_usb_stream(
    app_handle: AppHandle,
    session_id: String,
    config: GsUsbConfig,
    cancel_flag: Arc<AtomicBool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        run_gs_usb_stream(app_handle, session_id, config, cancel_flag).await;
    })
}

async fn run_gs_usb_stream(
    app_handle: AppHandle,
    session_id: String,
    config: GsUsbConfig,
    cancel_flag: Arc<AtomicBool>,
) {
    let buffer_name = config
        .display_name
        .clone()
        .unwrap_or_else(|| format!("gs_usb {}:{}", config.bus, config.address));
    let _buffer_id = buffer_store::create_buffer(BufferType::Frames, buffer_name);

    let stream_reason;
    let mut total_frames: i64 = 0;

    // Find and open device
    let device_info = match nusb::list_devices() {
        Ok(devices) => devices
            .find(|dev| {
                dev.bus_number() == config.bus
                    && dev.device_address() == config.address
                    && dev.vendor_id() == GS_USB_VID
                    && GS_USB_PIDS.contains(&dev.product_id())
            })
            .ok_or_else(|| "Device not found".to_string()),
        Err(e) => Err(format!("Failed to list devices: {}", e)),
    };

    let device_info = match device_info {
        Ok(d) => d,
        Err(e) => {
            emit_to_session(&app_handle, "can-bytes-error", &session_id, e);
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    };

    let device = match device_info.open() {
        Ok(d) => d,
        Err(e) => {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                format!("Failed to open device: {}", e),
            );
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    };

    let interface = match device.claim_interface(0) {
        Ok(i) => i,
        Err(e) => {
            emit_to_session(
                &app_handle,
                "can-bytes-error",
                &session_id,
                format!("Failed to claim interface: {}", e),
            );
            emit_stream_ended(&app_handle, &session_id, "error");
            return;
        }
    };

    eprintln!(
        "[gs_usb:{}] Opened device at {}:{} (bitrate: {}, listen_only: {})",
        session_id, config.bus, config.address, config.bitrate, config.listen_only
    );

    // Initialize device
    if let Err(e) = initialize_device(&interface, &config).await {
        emit_to_session(
            &app_handle,
            "can-bytes-error",
            &session_id,
            format!("Failed to initialize device: {}", e),
        );
        emit_stream_ended(&app_handle, &session_id, "error");
        return;
    }

    eprintln!("[gs_usb:{}] Device initialized, starting stream", session_id);

    // Bulk IN endpoint (usually 0x81 = EP1 IN)
    let bulk_in = interface.bulk_in_queue(0x81);

    // Pre-submit multiple read requests for better throughput
    for _ in 0..8 {
        bulk_in.submit(RequestBuffer::new(64));
    }

    let mut pending_frames: Vec<FrameMessage> = Vec::with_capacity(32);
    let mut last_emit_time = std::time::Instant::now();
    let emit_interval = Duration::from_millis(25);

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            stream_reason = "stopped";
            break;
        }

        // Check frame limit
        if let Some(limit) = config.limit {
            if total_frames >= limit {
                eprintln!(
                    "[gs_usb:{}] Reached limit of {} frames",
                    session_id, limit
                );
                stream_reason = "complete";
                break;
            }
        }

        // Wait for next transfer with timeout
        let transfer = tokio::time::timeout(Duration::from_millis(100), bulk_in.next_complete())
            .await;

        match transfer {
            Ok(completion) => {
                match completion.status {
                    Ok(()) => {
                        let data = completion.data;
                        if data.len() >= GsHostFrame::SIZE {
                            // Parse the frame
                            let frame_bytes: [u8; GsHostFrame::SIZE] =
                                data[..GsHostFrame::SIZE].try_into().unwrap();
                            let gs_frame: GsHostFrame =
                                unsafe { std::mem::transmute(frame_bytes) };

                            // Only process RX frames (not TX echoes)
                            if gs_frame.is_rx() {
                                let frame_msg = FrameMessage {
                                    protocol: "can".to_string(),
                                    timestamp_us: now_us(),
                                    frame_id: gs_frame.get_can_id(),
                                    bus: gs_frame.channel,
                                    dlc: gs_frame.can_dlc,
                                    bytes: gs_frame.get_data().to_vec(),
                                    is_extended: gs_frame.is_extended(),
                                    is_fd: false,
                                    source_address: None,
                                    incomplete: None,
                                    direction: None,
                                };
                                pending_frames.push(frame_msg);
                                total_frames += 1;
                            }
                        }

                        // Resubmit the buffer
                        bulk_in.submit(RequestBuffer::new(64));
                    }
                    Err(e) => {
                        eprintln!("[gs_usb:{}] Bulk transfer error: {:?}", session_id, e);
                        stream_reason = "error";
                        break;
                    }
                }
            }
            Err(_) => {
                // Timeout - this is normal for live streams with no traffic
            }
        }

        // Emit batched frames periodically
        if last_emit_time.elapsed() >= emit_interval && !pending_frames.is_empty() {
            let frames = std::mem::take(&mut pending_frames);
            buffer_store::append_frames(frames.clone());
            emit_frames(&app_handle, &session_id, frames);
            last_emit_time = std::time::Instant::now();
        }
    }

    // Emit remaining frames
    if !pending_frames.is_empty() {
        buffer_store::append_frames(pending_frames.clone());
        emit_frames(&app_handle, &session_id, pending_frames);
    }

    // Stop the device
    let _ = stop_device(&interface, config.channel).await;

    emit_stream_ended(&app_handle, &session_id, stream_reason);
}

/// Initialize the gs_usb device
async fn initialize_device(interface: &Interface, config: &GsUsbConfig) -> Result<(), String> {
    // 1. Send HOST_FORMAT
    let host_format = GS_USB_HOST_FORMAT.to_le_bytes();
    interface
        .control_out(ControlOut {
            control_type: ControlType::Vendor,
            recipient: Recipient::Interface,
            request: GsUsbBreq::HostFormat as u8,
            value: 1,
            index: 0,
            data: &host_format,
        })
        .await
        .status
        .map_err(|e| format!("HOST_FORMAT failed: {:?}", e))?;

    // 2. Set bit timing
    let timing = get_bittiming_for_bitrate(config.bitrate).ok_or_else(|| {
        format!(
            "Unsupported bitrate {}. Use 125000, 250000, 500000, or 1000000.",
            config.bitrate
        )
    })?;

    let timing_bytes = unsafe {
        std::slice::from_raw_parts(
            &timing as *const GsDeviceBittiming as *const u8,
            GsDeviceBittiming::SIZE,
        )
    };

    interface
        .control_out(ControlOut {
            control_type: ControlType::Vendor,
            recipient: Recipient::Interface,
            request: GsUsbBreq::Bittiming as u8,
            value: config.channel as u16,
            index: 0,
            data: timing_bytes,
        })
        .await
        .status
        .map_err(|e| format!("BITTIMING failed: {:?}", e))?;

    // 3. Set mode and start
    let mode_flags = if config.listen_only {
        can_mode::LISTEN_ONLY
    } else {
        can_mode::NORMAL
    };

    let mode = GsDeviceMode {
        mode: 1, // Start
        flags: mode_flags,
    };

    let mode_bytes = unsafe {
        std::slice::from_raw_parts(
            &mode as *const GsDeviceMode as *const u8,
            GsDeviceMode::SIZE,
        )
    };

    interface
        .control_out(ControlOut {
            control_type: ControlType::Vendor,
            recipient: Recipient::Interface,
            request: GsUsbBreq::Mode as u8,
            value: config.channel as u16,
            index: 0,
            data: mode_bytes,
        })
        .await
        .status
        .map_err(|e| format!("MODE failed: {:?}", e))?;

    Ok(())
}

/// Stop the gs_usb device
async fn stop_device(interface: &Interface, channel: u8) -> Result<(), String> {
    let mode = GsDeviceMode {
        mode: 0, // Stop
        flags: 0,
    };

    let mode_bytes = unsafe {
        std::slice::from_raw_parts(
            &mode as *const GsDeviceMode as *const u8,
            GsDeviceMode::SIZE,
        )
    };

    interface
        .control_out(ControlOut {
            control_type: ControlType::Vendor,
            recipient: Recipient::Interface,
            request: GsUsbBreq::Mode as u8,
            value: channel as u16,
            index: 0,
            data: mode_bytes,
        })
        .await
        .status
        .map_err(|e| format!("MODE stop failed: {:?}", e))?;

    Ok(())
}

/// Emit stream-ended event
fn emit_stream_ended(app_handle: &AppHandle, session_id: &str, reason: &str) {
    let metadata = buffer_store::finalize_buffer();

    let (buffer_id, buffer_type, count, time_range, buffer_available) = match metadata {
        Some(ref m) => {
            let type_str = match m.buffer_type {
                BufferType::Frames => "frames",
                BufferType::Bytes => "bytes",
            };
            (
                Some(m.id.clone()),
                Some(type_str.to_string()),
                m.count,
                match (m.start_time_us, m.end_time_us) {
                    (Some(start), Some(end)) => Some((start, end)),
                    _ => None,
                },
                m.count > 0,
            )
        }
        None => (None, None, 0, None, false),
    };

    emit_to_session(
        app_handle,
        "stream-ended",
        session_id,
        StreamEndedPayload {
            reason: reason.to_string(),
            buffer_available,
            buffer_id,
            buffer_type,
            count,
            time_range,
        },
    );

    eprintln!(
        "[gs_usb:{}] Stream ended (reason: {}, count: {})",
        session_id, reason, count
    );
}
