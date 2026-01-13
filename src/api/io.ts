// ui/src/api/io.ts
//
// API wrappers for the session-based IO system.
// Provides a unified interface for reading and writing CAN data.

import { invoke } from "@tauri-apps/api/core";

/**
 * IO capabilities - what an IO device type supports.
 */
export interface IOCapabilities {
  /** Supports pause/resume (PostgreSQL: true, GVRET: false) */
  can_pause: boolean;
  /** Supports time range filtering (PostgreSQL: true, GVRET: false) */
  supports_time_range: boolean;
  /** Is realtime data (GVRET: true, PostgreSQL: false) */
  is_realtime: boolean;
  /** Supports speed control (PostgreSQL: true, GVRET: false) */
  supports_speed_control: boolean;
  /** Supports seeking to a specific timestamp (BufferReader: true, others: false) */
  supports_seek: boolean;
  /** Can transmit CAN frames (slcan in normal mode, GVRET: true) */
  can_transmit: boolean;
  /** Can transmit serial bytes (serial port devices) */
  can_transmit_serial: boolean;
  /** Supports CAN FD (64 bytes, BRS) */
  supports_canfd: boolean;
  /** Supports extended (29-bit) CAN IDs */
  supports_extended_id: boolean;
  /** Supports Remote Transmission Request frames */
  supports_rtr: boolean;
  /** Available bus numbers (empty = single bus) */
  available_buses: number[];
}

/**
 * IO session state.
 */
export type IOState =
  | { type: "Stopped" }
  | { type: "Starting" }
  | { type: "Running" }
  | { type: "Paused" }
  | { type: "Error"; message: string };

/**
 * Simple IO state string for easy comparisons.
 */
export type IOStateType = "stopped" | "starting" | "running" | "paused" | "error";

/**
 * Convert IOState to simple string type.
 */
export function getStateType(state: IOState): IOStateType {
  switch (state.type) {
    case "Stopped":
      return "stopped";
    case "Starting":
      return "starting";
    case "Running":
      return "running";
    case "Paused":
      return "paused";
    case "Error":
      return "error";
  }
}

/**
 * Framing encoding types for serial readers.
 */
export type FramingEncoding = "slip" | "modbus_rtu" | "delimiter" | "raw";

/**
 * Options for creating an IO session.
 */
export interface CreateIOSessionOptions {
  /** Unique session ID (e.g., "discovery", "decoder") */
  sessionId: string;
  /** Profile ID to use (optional, defaults to default_read_profile) */
  profileId?: string;
  /** Start time for time-range capable readers (ISO-8601) */
  startTime?: string;
  /** End time for time-range capable readers (ISO-8601) */
  endTime?: string;
  /** Initial playback speed (default: 1.0) */
  speed?: number;
  /** Maximum number of frames to read (optional) */
  limit?: number;
  /** File path for file-based readers (e.g., csv_file) */
  filePath?: string;
  /** Use the shared buffer reader instead of a profile-based reader */
  useBuffer?: boolean;

  // Serial framing configuration
  /** Framing encoding for serial readers: "slip", "modbus_rtu", "delimiter", or "raw" */
  framingEncoding?: FramingEncoding;
  /** Delimiter byte sequence for delimiter-based framing (e.g., [0x0D, 0x0A] for CRLF) */
  delimiter?: number[];
  /** Maximum frame length for delimiter-based framing (default: 256) */
  maxFrameLength?: number;

  // Frame ID extraction configuration
  /** Frame ID extraction: start byte position (supports negative indexing from end) */
  frameIdStartByte?: number;
  /** Frame ID extraction: number of bytes (1 or 2) */
  frameIdBytes?: number;
  /** Frame ID extraction: byte order (true = big endian) */
  frameIdBigEndian?: boolean;

  // Source address extraction configuration
  /** Source address extraction: start byte position (supports negative indexing from end) */
  sourceAddressStartByte?: number;
  /** Source address extraction: number of bytes (1 or 2) */
  sourceAddressBytes?: number;
  /** Source address extraction: byte order (true = big endian) */
  sourceAddressBigEndian?: boolean;

  /** Minimum frame length to accept (frames shorter than this are discarded) */
  minFrameLength?: number;
  /** Also emit raw bytes (serial-raw-bytes) in addition to frames when framing is enabled */
  emitRawBytes?: boolean;
}

/**
 * Create a new IO session.
 * Returns the capabilities of the created IO device.
 */
export async function createIOSession(
  options: CreateIOSessionOptions
): Promise<IOCapabilities> {
  // Use buffer reader if requested
  if (options.useBuffer) {
    return invoke("create_buffer_reader_session", {
      session_id: options.sessionId,
      speed: options.speed,
    });
  }

  return invoke("create_reader_session", {
    session_id: options.sessionId,
    profile_id: options.profileId,
    start_time: options.startTime,
    end_time: options.endTime,
    speed: options.speed,
    limit: options.limit,
    file_path: options.filePath,
    // Framing configuration
    framing_encoding: options.framingEncoding,
    delimiter: options.delimiter,
    max_frame_length: options.maxFrameLength,
    // Frame ID extraction
    frame_id_start_byte: options.frameIdStartByte,
    frame_id_bytes: options.frameIdBytes,
    frame_id_big_endian: options.frameIdBigEndian,
    // Source address extraction
    source_address_start_byte: options.sourceAddressStartByte,
    source_address_bytes: options.sourceAddressBytes,
    source_address_big_endian: options.sourceAddressBigEndian,
    // Other options
    min_frame_length: options.minFrameLength,
    emit_raw_bytes: options.emitRawBytes,
  });
}

/**
 * Get the state of an IO session.
 * Returns null if the session doesn't exist.
 */
export async function getIOSessionState(
  sessionId: string
): Promise<IOState | null> {
  return invoke("get_reader_session_state", { session_id: sessionId });
}

/**
 * Get the capabilities of an IO session.
 * Returns null if the session doesn't exist.
 */
export async function getIOSessionCapabilities(
  sessionId: string
): Promise<IOCapabilities | null> {
  return invoke("get_reader_session_capabilities", { session_id: sessionId });
}

/**
 * Result of joining an existing session.
 */
export interface JoinSessionResult {
  capabilities: IOCapabilities;
  state: IOState;
  buffer_id: string | null;
  /** Type of the active buffer ("frames" or "bytes"), if any */
  buffer_type: "frames" | "bytes" | null;
  /** Number of apps connected to this session (including this one) */
  joiner_count: number;
}

/**
 * Join an existing reader session (for session sharing between apps).
 * Returns session info if session exists, throws error if not.
 * The caller can then set up event listeners to receive frames and state changes.
 * Any app that joins can control the session (start/stop/pause/resume).
 */
export async function joinReaderSession(sessionId: string): Promise<JoinSessionResult> {
  return invoke("join_reader_session", { session_id: sessionId });
}

/**
 * Leave a reader session without stopping it.
 * Call this when you want to stop listening but not stop the session.
 * The frontend should stop listening to events after calling this.
 * @returns The remaining joiner count after leaving
 */
export async function leaveReaderSession(sessionId: string): Promise<number> {
  return invoke("leave_reader_session", { session_id: sessionId });
}

// Legacy heartbeat functions removed - use registerSessionListener/unregisterSessionListener instead

/**
 * Get the current joiner count for a session.
 * Returns 0 if the session doesn't exist.
 */
export async function getReaderSessionJoinerCount(sessionId: string): Promise<number> {
  return invoke("get_reader_session_joiner_count", { session_id: sessionId });
}

/**
 * Start a reader session.
 * Returns the confirmed state after the operation.
 */
export async function startReaderSession(sessionId: string): Promise<IOState> {
  return invoke("start_reader_session", { session_id: sessionId });
}

/**
 * Stop a reader session.
 * Returns the confirmed state after the operation.
 */
export async function stopReaderSession(sessionId: string): Promise<IOState> {
  return invoke("stop_reader_session", { session_id: sessionId });
}

/**
 * Pause a reader session.
 * Only works for readers that support pause (e.g., PostgreSQL).
 * Returns the confirmed state after the operation.
 */
export async function pauseReaderSession(sessionId: string): Promise<IOState> {
  return invoke("pause_reader_session", { session_id: sessionId });
}

/**
 * Resume a paused reader session.
 * Returns the confirmed state after the operation.
 */
export async function resumeReaderSession(sessionId: string): Promise<IOState> {
  return invoke("resume_reader_session", { session_id: sessionId });
}

/**
 * Update playback speed for a reader session.
 * Only works for readers that support speed control (e.g., PostgreSQL).
 */
export async function updateReaderSpeed(
  sessionId: string,
  speed: number
): Promise<void> {
  return invoke("update_reader_speed", { session_id: sessionId, speed });
}

/**
 * Update time range for a reader session.
 * Only works when the reader is stopped and supports time range.
 */
export async function updateReaderTimeRange(
  sessionId: string,
  start?: string,
  end?: string
): Promise<void> {
  return invoke("update_reader_time_range", {
    session_id: sessionId,
    start,
    end,
  });
}

/**
 * Destroy a reader session.
 * Stops the reader if running and cleans up resources.
 */
export async function destroyReaderSession(sessionId: string): Promise<void> {
  return invoke("destroy_reader_session", { session_id: sessionId });
}

/**
 * Information about active profile usage.
 */
export interface ProfileUsage {
  /** ID of the session using this profile */
  session_id: string;
}

/**
 * Get the current usage of a profile (if any).
 * Used to check if a profile is in use by another session before creating a new one.
 * @param profileId - Profile to check
 * @returns Usage info or null if profile is not in use
 */
export async function getProfileUsage(profileId: string): Promise<ProfileUsage | null> {
  return invoke("get_profile_usage", { profileId });
}

/**
 * Seek a reader session to a specific timestamp.
 * Only works for readers that support seeking (e.g., BufferReader).
 * @param sessionId The session ID
 * @param timestampUs The target timestamp in microseconds
 */
export async function seekReaderSession(
  sessionId: string,
  timestampUs: number
): Promise<void> {
  return invoke("seek_reader_session", { session_id: sessionId, timestamp_us: timestampUs });
}

/**
 * Payload sent when a stream ends (GVRET disconnect, PostgreSQL query complete, etc.)
 */
export interface StreamEndedPayload {
  /** Reason for stream ending: "complete", "disconnected", "error", "stopped" */
  reason: string;
  /** Whether the buffer has data available for replay */
  buffer_available: boolean;
  /** ID of the buffer that was created (if any) */
  buffer_id: string | null;
  /** Type of buffer: "frames" or "bytes" */
  buffer_type: "frames" | "bytes" | null;
  /** Number of items in the buffer (frames or bytes depending on type) */
  count: number;
  /** Time range of captured data [first_us, last_us] or null if empty */
  time_range: [number, number] | null;
}

/**
 * Payload sent when a session's state changes.
 * Event name: session-state:{sessionId}
 */
export interface StateChangePayload {
  /** Previous state as a string (e.g., "stopped", "running", "error:message") */
  previous: string;
  /** Current state as a string */
  current: string;
  /** Active buffer ID if streaming to a buffer */
  buffer_id: string | null;
}

/**
 * Parse a state string from StateChangePayload into a IOStateType.
 */
export function parseStateString(stateStr: string): IOStateType {
  if (stateStr.startsWith("error:")) {
    return "error";
  }
  if (stateStr === "stopped" || stateStr === "starting" || stateStr === "running" || stateStr === "paused") {
    return stateStr;
  }
  return "stopped"; // fallback
}

/**
 * Transition an existing session to use the shared buffer for replay.
 * This is used after a streaming source (GVRET, PostgreSQL) ends to replay captured frames.
 * @param sessionId The session ID
 * @param speed Initial playback speed (default: 1.0)
 */
export async function transitionToBufferReader(
  sessionId: string,
  speed?: number
): Promise<IOCapabilities> {
  return invoke("transition_to_buffer_reader", { session_id: sessionId, speed });
}

// ============================================================================
// Transmission Types and Functions
// ============================================================================

/**
 * CAN frame for transmission.
 */
export interface CanTransmitFrame {
  /** CAN frame ID (11-bit standard or 29-bit extended) */
  frame_id: number;
  /** Frame data (up to 8 bytes for classic CAN, up to 64 for CAN FD) */
  data: number[];
  /** Bus number (0 for single-bus adapters, 0-4 for multi-bus like GVRET) */
  bus?: number;
  /** Extended (29-bit) frame ID */
  is_extended?: boolean;
  /** CAN FD frame */
  is_fd?: boolean;
  /** Bit Rate Switch (CAN FD only) */
  is_brs?: boolean;
  /** Remote Transmission Request */
  is_rtr?: boolean;
}

/**
 * Result of a transmit operation.
 */
export interface TransmitResult {
  /** Whether the transmission was successful */
  success: boolean;
  /** Timestamp when the frame was sent (microseconds since UNIX epoch) */
  timestamp_us: number;
  /** Error message if transmission failed */
  error?: string;
}

/**
 * Transmit a CAN frame through a session.
 * The session must be running and support transmission (can_transmit capability).
 * @param sessionId The session ID
 * @param frame The CAN frame to transmit
 */
export async function sessionTransmitFrame(
  sessionId: string,
  frame: CanTransmitFrame
): Promise<TransmitResult> {
  return invoke("session_transmit_frame", { session_id: sessionId, frame });
}

// ============================================================================
// Listener Registration API
// ============================================================================

/**
 * Info about a registered listener.
 */
export interface ListenerInfo {
  /** Unique ID for this listener (e.g., "discovery", "decoder") */
  listener_id: string;
  /** Whether this listener is the session owner (created the session) */
  is_owner: boolean;
  /** Seconds since registration */
  registered_seconds_ago: number;
}

/**
 * Result of registering a listener.
 */
export interface RegisterListenerResult {
  /** Session capabilities */
  capabilities: IOCapabilities;
  /** Current session state */
  state: IOState;
  /** Active buffer ID (if any) */
  buffer_id: string | null;
  /** Buffer type ("frames" or "bytes") */
  buffer_type: "frames" | "bytes" | null;
  /** Whether this listener is the session owner */
  is_owner: boolean;
  /** Total number of listeners */
  listener_count: number;
}

/**
 * Register a listener for a session.
 * This is the primary way for frontend components to join a session.
 * If the listener is already registered, this updates their heartbeat.
 * @param sessionId The session ID
 * @param listenerId A unique ID for this listener (e.g., "discovery", "decoder")
 * @returns Session info including whether this listener is the owner
 */
export async function registerSessionListener(
  sessionId: string,
  listenerId: string
): Promise<RegisterListenerResult> {
  return invoke("register_session_listener", {
    session_id: sessionId,
    listener_id: listenerId,
  });
}

/**
 * Unregister a listener from a session.
 * If this was the last listener, the session will be stopped (but not destroyed).
 * @param sessionId The session ID
 * @param listenerId The listener ID to unregister
 * @returns The remaining listener count
 */
export async function unregisterSessionListener(
  sessionId: string,
  listenerId: string
): Promise<number> {
  return invoke("unregister_session_listener", {
    session_id: sessionId,
    listener_id: listenerId,
  });
}

/**
 * Get all listeners for a session.
 * Useful for debugging and for the frontend to understand session state.
 * @param sessionId The session ID
 * @returns List of registered listeners
 */
export async function getSessionListeners(
  sessionId: string
): Promise<ListenerInfo[]> {
  return invoke("get_session_listener_list", { session_id: sessionId });
}

/**
 * Result of attempting a safe reinitialize.
 */
export interface ReinitializeResult {
  /** Whether the reinitialize was successful */
  success: boolean;
  /** Reason for failure (if success is false) */
  reason?: string;
  /** List of other listeners preventing reinitialize (if any) */
  other_listeners: string[];
}

/**
 * Check if it's safe to reinitialize a session and do so if safe.
 * Reinitialize is only safe if the requesting listener is the only listener.
 * This is an atomic check-and-act operation to prevent race conditions.
 *
 * If safe, the session will be destroyed so a new one can be created.
 * @param sessionId The session ID
 * @param listenerId The requesting listener's ID
 * @returns Result indicating success or failure with reason
 */
export async function reinitializeSessionIfSafe(
  sessionId: string,
  listenerId: string
): Promise<ReinitializeResult> {
  return invoke("reinitialize_session_if_safe_cmd", {
    session_id: sessionId,
    listener_id: listenerId,
  });
}

/**
 * Set whether a listener is active (receiving frames).
 * When a listener detaches, set isActive to false to stop receiving frames.
 * When they rejoin, set isActive to true to resume receiving frames.
 * This is handled in Rust to avoid frontend race conditions.
 * @param sessionId The session ID
 * @param listenerId The listener ID
 * @param isActive Whether the listener should receive frames
 */
export async function setSessionListenerActive(
  sessionId: string,
  listenerId: string,
  isActive: boolean
): Promise<void> {
  return invoke("set_session_listener_active", {
    session_id: sessionId,
    listener_id: listenerId,
    is_active: isActive,
  });
}
