// ui/src/apps/decoder/hooks/handlers/useDecoderCatalogHandlers.ts
//
// Catalog-related handlers for Decoder: catalog change, clear data by active tab.

import { useCallback } from "react";
import { useSessionStore } from "../../../../stores/sessionStore";

export interface UseDecoderCatalogHandlersParams {
  // Store actions
  loadCatalog: (path: string) => Promise<void>;
  clearDecoded: () => void;
  clearUnmatchedFrames: () => void;
  clearFilteredFrames: () => void;

  // Active tab for per-tab clear functionality
  activeTab: string;
}

export function useDecoderCatalogHandlers({
  loadCatalog,
  clearDecoded,
  clearUnmatchedFrames,
  clearFilteredFrames,
  activeTab,
}: UseDecoderCatalogHandlersParams) {
  // Handle catalog change
  const handleCatalogChange = useCallback(
    async (path: string) => {
      if (path) {
        try {
          await loadCatalog(path);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("Failed to load catalog:", e);
          useSessionStore.getState().showAppError("Catalog Error", "Failed to load catalog.", msg);
        }
      }
    },
    [loadCatalog]
  );

  // Clear handler based on active tab
  const handleClear = useCallback(() => {
    switch (activeTab) {
      case "signals":
        clearDecoded();
        break;
      case "unmatched":
        clearUnmatchedFrames();
        break;
      case "filtered":
        clearFilteredFrames();
        break;
    }
  }, [activeTab, clearDecoded, clearUnmatchedFrames, clearFilteredFrames]);

  return {
    handleCatalogChange,
    handleClear,
  };
}

export type DecoderCatalogHandlers = ReturnType<typeof useDecoderCatalogHandlers>;
