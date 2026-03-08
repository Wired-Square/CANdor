// Simple store to track panel focus and open panels per window
// This avoids race conditions with event-based focus tracking

import { create } from "zustand";

interface FocusState {
  /** The currently focused panel ID, or null if none */
  focusedPanelId: string | null;
  /** IDs of all currently open Dockview panels */
  openPanelIds: string[];
  /** Set the focused panel ID */
  setFocusedPanelId: (panelId: string | null) => void;
  /** Track a panel being opened */
  addOpenPanel: (panelId: string) => void;
  /** Track a panel being closed */
  removeOpenPanel: (panelId: string) => void;
  /** Seed the full set of open panels (e.g., after layout restore) */
  setOpenPanels: (panelIds: string[]) => void;
}

export const useFocusStore = create<FocusState>((set) => ({
  focusedPanelId: null,
  openPanelIds: [],
  setFocusedPanelId: (panelId) => set({ focusedPanelId: panelId }),
  addOpenPanel: (panelId) =>
    set((s) =>
      s.openPanelIds.includes(panelId)
        ? s
        : { openPanelIds: [...s.openPanelIds, panelId] }
    ),
  removeOpenPanel: (panelId) =>
    set((s) => ({ openPanelIds: s.openPanelIds.filter((id) => id !== panelId) })),
  setOpenPanels: (panelIds) => set({ openPanelIds: panelIds }),
}));
