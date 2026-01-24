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

// Track all open main windows (dashboard + any additional windows)
const MAIN_WINDOWS_KEY = 'session.mainWindows';

/**
 * Get list of main window labels that were open in last session
 */
export async function getOpenMainWindows(): Promise<string[]> {
  const store = await getStore();
  const windows = await store.get<string[]>(MAIN_WINDOWS_KEY);
  return windows || ['dashboard']; // Always include dashboard
}

/**
 * Save list of currently open main window labels
 */
export async function saveOpenMainWindows(labels: string[]): Promise<void> {
  const store = await getStore();
  // Always ensure dashboard is included
  const uniqueLabels = [...new Set(['dashboard', ...labels])];
  await store.set(MAIN_WINDOWS_KEY, uniqueLabels);
  await store.save();
}

/**
 * Add a window to the open windows list
 */
export async function addOpenMainWindow(label: string): Promise<void> {
  const current = await getOpenMainWindows();
  if (!current.includes(label)) {
    await saveOpenMainWindows([...current, label]);
  }
}

/**
 * Remove a window from the open windows list
 */
export async function removeOpenMainWindow(label: string): Promise<void> {
  if (label === 'dashboard') return; // Never remove dashboard
  const current = await getOpenMainWindows();
  await saveOpenMainWindows(current.filter(l => l !== label));
}

/**
 * Get the next available main window number
 */
export async function getNextMainWindowNumber(): Promise<number> {
  const current = await getOpenMainWindows();
  let maxNum = 0;
  for (const label of current) {
    const match = label.match(/^main-(\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return maxNum + 1;
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
