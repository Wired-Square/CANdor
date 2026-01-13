// ui/src/api/discovery.ts
// CAN streaming and discovery-related Tauri commands

import { invoke } from "@tauri-apps/api/core";

export interface StartStreamOptions {
  profile?: string;
  [key: string]: unknown;
}

/**
 * Start CAN data streaming
 * Emits "can-bytes" and "frame-message" events
 */
export async function startCanStream(options?: StartStreamOptions): Promise<void> {
  await invoke("start_can_stream", options);
}

/**
 * Stop CAN data streaming
 */
export async function stopCanStream(): Promise<void> {
  await invoke("stop_can_stream");
}

/**
 * Update playback speed for PostgreSQL streams
 * @param speed - The playback speed multiplier (1.0 = realtime, 2.0 = 2x, etc.)
 */
export async function updatePlaybackSpeed(speed: number): Promise<void> {
  await invoke("update_playback_speed", { speed });
}
