// Window state persistence using tauri-plugin-store

import { Store } from '@tauri-apps/plugin-store';
import type { WindowLabel } from './windows';

let windowStorePromise: Promise<Store> | null = null;
async function getStore(): Promise<Store> {
  if (!windowStorePromise) {
    windowStorePromise = Store.load('windows.dat');
  }
  return windowStorePromise;
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowPersistence {
  geometry: WindowGeometry;
  wasOpen: boolean;
  lastFocused?: number; // timestamp
}

/**
 * Save window state to persistent storage
 */
export async function saveWindowState(
  label: WindowLabel,
  state: WindowPersistence
): Promise<void> {
  const store = await getStore();
  await store.set(`window.${label}`, state);
  await store.save();
}

/**
 * Load window state from persistent storage
 */
export async function loadWindowState(
  label: WindowLabel
): Promise<WindowPersistence | null> {
  const store = await getStore();
  const state = await store.get<WindowPersistence>(`window.${label}`);
  return state || null;
}

/**
 * Get list of windows that were open in last session
 */
export async function getOpenWindowsSession(): Promise<WindowLabel[]> {
  const store = await getStore();
  const session = await store.get<WindowLabel[]>('session.openWindows');
  return session || [];
}

/**
 * Save list of currently open windows for session restore
 */
export async function saveOpenWindowsSession(labels: WindowLabel[]): Promise<void> {
  const store = await getStore();
  await store.set('session.openWindows', labels);
  await store.save();
}

/**
 * Clear all window persistence data
 */
export async function clearWindowPersistence(): Promise<void> {
  const store = await getStore();
  await store.clear();
  await store.save();
}
