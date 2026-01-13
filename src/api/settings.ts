// ui/src/api/settings.ts
// Settings-related Tauri commands

import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../hooks/useSettings";

/**
 * Load application settings from the backend
 */
export async function loadSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>("load_settings");
}

/**
 * Save application settings to the backend
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { settings });
}

/**
 * Validate that a directory exists and is writable
 */
export async function validateDirectory(path: string): Promise<{ exists: boolean; writable: boolean; error?: string }> {
  return await invoke("validate_directory", { path });
}

/**
 * Create a directory at the given path
 */
export async function createDirectory(path: string): Promise<void> {
  await invoke("create_directory", { path });
}

/**
 * Get the application version
 */
export async function getAppVersion(): Promise<string> {
  return await invoke<string>("get_app_version");
}
