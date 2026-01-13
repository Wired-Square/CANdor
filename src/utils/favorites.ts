// Time range favorites persistence using tauri-plugin-store

import { Store } from '@tauri-apps/plugin-store';

let favoritesStorePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!favoritesStorePromise) {
    favoritesStorePromise = Store.load('favorites.dat');
  }
  return favoritesStorePromise;
}

/**
 * A favorite time range bookmark
 */
export interface TimeRangeFavorite {
  /** Unique identifier */
  id: string;
  /** Display name for the favorite */
  name: string;
  /** IO profile ID this favorite is associated with */
  profileId: string;
  /** Start time in ISO-8601 format or datetime-local format */
  startTime: string;
  /** End time in ISO-8601 format or datetime-local format */
  endTime: string;
  /** Maximum number of frames to read (optional) */
  maxFrames?: number;
  /** When this favorite was created */
  createdAt: number;
  /** When this favorite was last used */
  lastUsedAt?: number;
}

/**
 * Generate a unique ID for a new favorite
 */
function generateId(): string {
  return `fav_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get all favorites
 */
export async function getAllFavorites(): Promise<TimeRangeFavorite[]> {
  const store = await getStore();
  const favorites = await store.get<TimeRangeFavorite[]>('timeRangeFavorites');
  return favorites || [];
}

/**
 * Get favorites for a specific IO profile
 */
export async function getFavoritesForProfile(profileId: string): Promise<TimeRangeFavorite[]> {
  const all = await getAllFavorites();
  return all.filter(f => f.profileId === profileId);
}

/**
 * Add a new favorite
 */
export async function addFavorite(
  name: string,
  profileId: string,
  startTime: string,
  endTime: string
): Promise<TimeRangeFavorite> {
  const store = await getStore();
  const favorites = await getAllFavorites();

  const newFavorite: TimeRangeFavorite = {
    id: generateId(),
    name,
    profileId,
    startTime,
    endTime,
    createdAt: Date.now(),
  };

  favorites.push(newFavorite);
  await store.set('timeRangeFavorites', favorites);
  await store.save();

  return newFavorite;
}

/**
 * Update an existing favorite
 */
export async function updateFavorite(
  id: string,
  updates: Partial<Omit<TimeRangeFavorite, 'id' | 'createdAt'>>
): Promise<TimeRangeFavorite | null> {
  const store = await getStore();
  const favorites = await getAllFavorites();

  const index = favorites.findIndex(f => f.id === id);
  if (index === -1) return null;

  favorites[index] = { ...favorites[index], ...updates };
  await store.set('timeRangeFavorites', favorites);
  await store.save();

  return favorites[index];
}

/**
 * Mark a favorite as recently used
 */
export async function markFavoriteUsed(id: string): Promise<void> {
  await updateFavorite(id, { lastUsedAt: Date.now() });
}

/**
 * Delete a favorite
 */
export async function deleteFavorite(id: string): Promise<boolean> {
  const store = await getStore();
  const favorites = await getAllFavorites();

  const index = favorites.findIndex(f => f.id === id);
  if (index === -1) return false;

  favorites.splice(index, 1);
  await store.set('timeRangeFavorites', favorites);
  await store.save();

  return true;
}

/**
 * Delete all favorites for a specific profile
 */
export async function deleteFavoritesForProfile(profileId: string): Promise<number> {
  const store = await getStore();
  const favorites = await getAllFavorites();

  const remaining = favorites.filter(f => f.profileId !== profileId);
  const deletedCount = favorites.length - remaining.length;

  await store.set('timeRangeFavorites', remaining);
  await store.save();

  return deletedCount;
}

/**
 * Clear all favorites
 */
export async function clearAllFavorites(): Promise<void> {
  const store = await getStore();
  await store.set('timeRangeFavorites', []);
  await store.save();
}
