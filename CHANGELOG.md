# Changelog

All notable changes to CANdor will be documented in this file.

## [0.2.33] - 2026-01-24

### Added

- **Multi-Window Support**: Open multiple CANdor windows via View → New Window (Cmd+N). Each window maintains its own independent tab layout.
- **Per-Window Tab Persistence**: Each window remembers its open tabs and layout. Tabs are restored when the window reopens.
- **Window State Persistence**: Window size and position are automatically saved and restored on relaunch.
- **Session Restore**: All open windows are restored when relaunching CANdor, each with their saved tabs, size, and position.
- **Timezone Display Setting**: New "Default timezone" option in Settings → Display allows choosing between Local and UTC for clock displays. Clock displays in Decoder and Discovery now show a clickable badge (Local/UTC) that cycles through timezone options without changing the global setting.
- **Date Display for Recorded Sources**: Clock displays now show both date and time when viewing recorded data (PostgreSQL, CSV, buffers), while live sources show time only.
- **Second-Precision Bookmarks**: Bookmark time inputs now support second-level precision. Previously bookmarks were limited to minute granularity.
- **Session Joining for Recorded Sources**: Active PostgreSQL sessions now appear in the IO Reader Picker's "Active Sessions" section, allowing other apps (e.g., Decoder) to join an existing streaming session from Discovery. Previously only multi-bus sessions were shown as joinable.
- **Centralized Bookmark Button**: The bookmark picker button is now part of the session controls (next to play/stop) in Decoder and Discovery top bars. The button only appears when the data source supports time range filtering (e.g., PostgreSQL), and is disabled while streaming since time range cannot be changed mid-stream.
- **Discovery Speed Picker**: The playback speed button is now visible in the Discovery top bar when using recorded sources (PostgreSQL). Previously only available in Decoder.
- **Continue Without Reader**: IO Reader Picker dialog now shows a "Continue Without Reader" button when no reader is selected, allowing users to set up Transmit frames before connecting to a device.

### Fixed

- **Ingest Frame Count NaN**: Fixed "Ingesting: NaN frames" display in the IO Reader Picker dialog when ingesting from PostgreSQL and other sources using the new frame batch payload format. The frame message listener now handles both legacy array format and the newer `FrameBatchPayload` object format.
- **Panel Scroll Overflow**: Fixed app panels scrolling beyond their boundaries and going underneath the title bar on macOS. Root html/body elements now use `position: fixed` and `overscroll-behavior: none` to completely lock the webview in place. App components use `h-full` instead of `h-screen`, a centralized `PanelWrapper` ensures proper height constraints, and scroll containers use `overscroll-none`.
- **Decoder Unlimited Speed Playback**: Fixed issue where the Decoder would not show decoded signals when playing back from PostgreSQL at unlimited speed (0x). Frames are now flushed immediately when stream ends, ensuring all frames are processed before completion.
- **Second-Precision Bookmark Timestamps**: Fixed PostgreSQL queries failing when using bookmarks with second-precision timestamps. The timestamp format was being double-suffixed (e.g., `09:04:20:00` instead of `09:04:20`).
- **Watch Mode Playback Pacing**: Fixed IO Reader Picker defaulting to unlimited speed (0x) for Watch mode instead of 1x realtime. Watch now correctly defaults to 1x with pacing enabled, ensuring recorded data plays back at the intended speed.
- **IO Reader Picker Selection Stability**: Fixed data source selection being cleared when changing watch speed in the IO Reader Picker dialog. The issue was caused by a new empty array being created on each re-render, triggering the dialog's initialization effect.
- **Discovery Speed Picker Dialog**: Fixed speed picker in Discovery showing a "Change Speed Mode?" warning dialog instead of the speed picker. Discovery now uses the same SpeedPickerDialog as Decoder, with the confirmation dialog only appearing when switching from No Limit mode with frames present.
- **Cross-Window Speed Synchronization**: Fixed playback speed not syncing between windows when apps share a session. When Discovery changes speed while Decoder is viewing the same PostgreSQL session, Decoder's speed display now updates automatically. The backend now emits `speed-changed` events and apps subscribe via `onSpeedChange` callback.
- **Discovery Protocol Badge Case**: Fixed protocol badge showing lowercase "can" in Discovery. Now displays uppercase "CAN" to match Decoder.
- **Transmit Top Bar Styling**: Fixed Transmit icon color (blue→red) to match the tab icon, and added separator after icon for consistency with Decoder and Discovery.
- **Transmit Protocol Badge Label**: Fixed protocol badge losing its text when IO session is stopped. Now defaults to "CAN" or "Serial" based on the active tab when no session is connected.

### Changed

- **Shared Protocol Badge Component**: Extracted protocol badge (with status light, protocol label, recorded indicator) into reusable `ProtocolBadge` component. Now used consistently across Decoder, Discovery, and Transmit. The badge is clickable for future protocol configuration features.
- **Transmit View Styling**: Transmit now has the same dark-themed tab bar style as Decoder and Discovery, with a protocol badge showing streaming status and "CAN" or "Serial" label based on the connected device's capabilities.
- **Simplified View Menu**: The View menu now contains only "New Window" and "Enter Fullscreen". App shortcuts (Dashboard, Decoder, Discovery, etc.) have been removed in favor of using the logo menu within windows.
- **Centralized IO Session Management**: Added `useIOSessionManager` hook to consolidate common IO session patterns (profile state, multi-bus coordination, derived state, detach/rejoin handlers). Transmit app now uses this hook, reducing code duplication and establishing a pattern for incremental adoption by other apps.
- **Unified Session Architecture**: All real-time device sessions (GVRET, slcan, gs_usb, SocketCAN) now use the same internal `MultiSourceReader` path, even for single-device sessions. This simplifies the codebase by eliminating duplicate code paths (~500 lines) while maintaining the same external API. Single-device sessions are now implemented as multi-device sessions with n=1.
- **PostgreSQL No-Limit Batch Size**: Reduced from 1000 to 50 frames per batch to match frontend throttling thresholds, improving decoder responsiveness during fast playback.
- **Dialog State Management**: Added `useDialogManager` hook to consolidate multiple `useState` pairs for dialog visibility into a single hook call. Decoder and Discovery now use this hook, reducing boilerplate and providing a cleaner API (`dialogs.xxx.open()`, `dialogs.xxx.close()`, `dialogs.xxx.isOpen`).
- **Unified IO Session Controls**: Introduced `IOSessionControls` component that combines reader button, speed picker, bookmark button, and session action buttons (stop/resume/detach/rejoin) into a single reusable component. All three apps (Decoder, Discovery, Transmit) now use this unified component for consistent session control layout.
- **Removed No Limit Mode**: Removed the "No Limit" (0x) playback speed option from Discovery. This mode was intended for fast ingestion but added complexity. Users should now use the standard speed options (0.25x to 60x) for playback. The `PlaybackSpeed` type is now centralized in `TimeController` component.

## [0.2.32] - 2026-01-22

### Added

- **Serial Transmit**: Added support for transmitting raw bytes through serial port connections. The Serial tab in the Transmit app now supports:
  - Single-shot byte transmission with optional SLIP or delimiter framing
  - Repeat transmission from the queue at configurable intervals
  - Full history logging for transmitted bytes
- **Multi-Bus Capture**: Support for combining multiple real-time devices into a single merged session. Select multiple sources in the IO Reader Picker using the new "Multi-Bus" toggle. Each source can be configured with:
  - Per-bus enable/disable toggles to filter unwanted buses (for GVRET multi-bus devices)
  - Output bus remapping to assign unique bus numbers across devices
  - Auto-sequential bus number assignment when adding sources
  - Warning indicators when duplicate output bus numbers are configured
- **Unified Device Probing**: All real-time devices (GVRET, slcan, gs_usb, SocketCAN, Serial) are now probed when selected to confirm they're online and healthy. Shows device status and allows bus number configuration.
- **Single-Bus Device Configuration**: When selecting a single-bus device (slcan, gs_usb, etc.) in the IO Reader Picker, you can now configure the output bus number for multi-bus capture scenarios.
- **Multi-Bus Session Sharing**: Active multi-bus sessions now appear in the IO Reader Picker for other apps (e.g., Decoder) to join. When Discovery creates a multi-bus session, it's shown in the "Active Multi-Bus Sessions" section so other apps can receive the same merged frame stream.
- **Discovery Multi-Bus Indicator**: The Discovery top bar now shows "Multi-Bus (N)" with a merge icon when a multi-source session is active, replacing the previous "No reader" display.
- **Multi-Bus Transmit Support**: Transmit app now supports multi-bus sessions. When connected to a multi-bus session, frame transmission is routed to the appropriate source device based on the target bus number. Bus numbers are mapped back to the correct device bus for transmission.
- **Transmit History**: Repeat transmissions (individual and group) now appear in the Transmit History tab. Each frame sent during a repeat cycle is logged with timestamp, success/error status, and frame details.

### Fixed

- **Serial Reconnection**: Fixed issue where serial ports (slcan, serial) could not be reconnected after disconnecting. Two issues were addressed:
  1. Profile tracker not being cleaned up when sessions auto-destroyed via listener unregistration
  2. Transmit app's Stop button now properly leaves the session to release single-handle devices

### Changed

- **sbrxxx.toml**: Updated Sungrow decoder catalog to v3.
- **Transmit Default Interval**: Changed the default repeat transmit interval from 100ms to 1000ms.
- **Adaptive Frame Flushing**: Frame delivery now uses adaptive timing instead of fixed 100ms intervals. Frames are flushed when either 50 frames accumulate (for high-frequency buses) or after 50ms (for low-frequency data). This reduces latency for sparse data while maintaining UI performance under heavy load.
- **Dedicated Transmit Tasks**: GVRET TCP and gs_usb drivers now use dedicated transmit tasks that run independently of the read loop. This ensures consistent transmit timing regardless of incoming traffic volume, fixing issues where transmits could be delayed by 2+ seconds during heavy bus activity.
- **Improved Repeat Transmit Timing**: Repeat transmit now sends the first frame immediately and only starts the interval timer after the first successful transmission. Permanent errors (device disconnected, session not found) stop the repeat and notify the UI.
- **Transmit History Timestamps**: History tab now honors the display time format setting (human, timestamp, delta-start, delta-last) consistent with Discovery.
- **Transmit Bus Display**: Bus numbers in Transmit Queue and History views now show generic "Bus 0", "Bus 1" labels instead of GVRET-specific names, consistent with multi-bus mode where devices are mixed.

## [0.2.31] - 2026-01-15

### Fixed

- **64-bit Signal Decoding**: Fixed signals with bit_length > 32 being truncated due to JavaScript's 32-bit bitwise operator limitation. Now uses BigInt for extraction and formatting of large signals.

### Changed

- **sbrxxx.toml**: Updated Sungrow decoder catalog.
- **Release Script**: Now runs `cargo check` to update Cargo.lock before committing version bump.

## [0.2.30] - 2026-01-14

### Added

- **Update Checker**: App now checks for updates on launch and displays an amber indicator in the menu bar when a newer version is available. Clicking the indicator opens the GitHub release page.
- **gs_usb Support**: Added support for candleLight/CANable devices with gs_usb firmware on Windows, macOS, and Linux. On Linux, devices appear as SocketCAN interfaces; on Windows and macOS, direct USB access via nusb userspace driver. Supports all standard CAN bitrates (10K-1M).
- **MQTT Reader**: Added MQTT broker support for receiving CAN frames. Supports SavvyCAN JSON format with optional CAN FD. Configure host, port, credentials, and subscription topic in Settings.

### Fixed

- **gs_usb Device Selection**: Fixed device picker not updating when selecting a gs_usb device. The issue was caused by stale closures when multiple connection fields were updated in a single event handler.
- **gs_usb Categorization**: gs_usb profiles now correctly appear under "Real-time" in the Data Source picker instead of "Recorded".

## [0.2.29] - 2026-01-13

### Fixed

- **Decoder**: Fixed stale session restart when switching IO profiles. When switching from one GVRET endpoint to another, the old session was incorrectly being restarted due to a stale closure capturing the previous session ID. The Decoder now correctly relies on the backend's auto-start behavior after reinitializing a session.
