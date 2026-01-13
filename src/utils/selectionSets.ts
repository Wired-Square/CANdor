// Selection set persistence using tauri-plugin-store

import { Store } from '@tauri-apps/plugin-store';

let selectionSetStorePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!selectionSetStorePromise) {
    selectionSetStorePromise = Store.load('selection-sets.dat');
  }
  return selectionSetStorePromise;
}

/**
 * A saved selection set of frame IDs with their selection state
 */
export interface SelectionSet {
  /** Unique identifier */
  id: string;
  /** Display name for the selection set */
  name: string;
  /** All frame IDs in this set (visible in picker) */
  frameIds: number[];
  /** Frame IDs that are selected (subset of frameIds) */
  selectedIds: number[];
  /** When this selection set was created */
  createdAt: number;
  /** When this selection set was last used */
  lastUsedAt?: number;
}

/**
 * Generate a unique ID for a new selection set
 */
function generateId(): string {
  return `ss_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get all selection sets
 */
export async function getAllSelectionSets(): Promise<SelectionSet[]> {
  const store = await getStore();
  const sets = await store.get<SelectionSet[]>('selectionSets');
  return sets || [];
}

/**
 * Add a new selection set
 */
export async function addSelectionSet(
  name: string,
  frameIds: number[],
  selectedIds: number[]
): Promise<SelectionSet> {
  const store = await getStore();
  const sets = await getAllSelectionSets();

  const newSet: SelectionSet = {
    id: generateId(),
    name,
    frameIds: [...frameIds],
    selectedIds: [...selectedIds],
    createdAt: Date.now(),
  };

  sets.push(newSet);
  await store.set('selectionSets', sets);
  await store.save();

  return newSet;
}

/**
 * Update an existing selection set
 */
export async function updateSelectionSet(
  id: string,
  updates: Partial<Omit<SelectionSet, 'id' | 'createdAt'>>
): Promise<SelectionSet | null> {
  const store = await getStore();
  const sets = await getAllSelectionSets();

  const index = sets.findIndex(s => s.id === id);
  if (index === -1) return null;

  sets[index] = { ...sets[index], ...updates };
  await store.set('selectionSets', sets);
  await store.save();

  return sets[index];
}

/**
 * Mark a selection set as recently used
 */
export async function markSelectionSetUsed(id: string): Promise<void> {
  await updateSelectionSet(id, { lastUsedAt: Date.now() });
}

/**
 * Delete a selection set
 */
export async function deleteSelectionSet(id: string): Promise<boolean> {
  const store = await getStore();
  const sets = await getAllSelectionSets();

  const index = sets.findIndex(s => s.id === id);
  if (index === -1) return false;

  sets.splice(index, 1);
  await store.set('selectionSets', sets);
  await store.save();

  return true;
}

/**
 * Clear all selection sets
 */
export async function clearAllSelectionSets(): Promise<void> {
  const store = await getStore();
  await store.set('selectionSets', []);
  await store.save();
}
