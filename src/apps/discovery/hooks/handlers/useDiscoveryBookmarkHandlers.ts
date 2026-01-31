// ui/src/apps/discovery/hooks/handlers/useDiscoveryBookmarkHandlers.ts
//
// Bookmark handlers for Discovery: load, save, bookmark dialog.

import { useCallback } from "react";
import { addFavorite, type TimeRangeFavorite } from "../../../../utils/favorites";
import { microsToDatetimeLocal } from "../../../../utils/timeFormat";
import type { IngestOptions } from "../../../../hooks/useIOSessionManager";

export interface UseDiscoveryBookmarkHandlersParams {
  // State
  ioProfile: string | null;
  sourceProfileId: string | null;

  // State setters
  setBookmarkFrameId: (id: number) => void;
  setBookmarkFrameTime: (time: string) => void;

  // Manager method for jumping to bookmarks
  jumpToBookmark: (bookmark: TimeRangeFavorite, options?: Omit<IngestOptions, "startTime" | "endTime" | "maxFrames">) => Promise<void>;

  // Dialog controls
  openBookmarkDialog: () => void;
}

export function useDiscoveryBookmarkHandlers({
  ioProfile,
  sourceProfileId,
  setBookmarkFrameId,
  setBookmarkFrameTime,
  jumpToBookmark,
  openBookmarkDialog,
}: UseDiscoveryBookmarkHandlersParams) {
  // Handle bookmark button click from DiscoveryFramesView
  const handleBookmark = useCallback((frameId: number, timestampUs: number) => {
    setBookmarkFrameId(frameId);
    setBookmarkFrameTime(microsToDatetimeLocal(timestampUs));
    openBookmarkDialog();
  }, [setBookmarkFrameId, setBookmarkFrameTime, openBookmarkDialog]);

  // Handle saving a bookmark
  // Use sourceProfileId (the original data source) rather than ioProfile (which may be BUFFER_PROFILE_ID)
  const handleSaveBookmark = useCallback(async (name: string, fromTime: string, toTime: string) => {
    const profileId = sourceProfileId || ioProfile;
    if (!profileId) return;
    await addFavorite(name, profileId, fromTime, toTime);
  }, [sourceProfileId, ioProfile]);

  // Handle loading a bookmark - delegates to manager's jumpToBookmark
  // The manager handles: stopping if streaming, cleanup, reinitialize, notify apps
  const handleLoadBookmark = useCallback(async (bookmark: TimeRangeFavorite) => {
    console.log("[Discovery:handleLoadBookmark] Delegating to manager.jumpToBookmark:", bookmark.name);
    await jumpToBookmark(bookmark);
  }, [jumpToBookmark]);

  return {
    handleBookmark,
    handleSaveBookmark,
    handleLoadBookmark,
  };
}

export type DiscoveryBookmarkHandlers = ReturnType<typeof useDiscoveryBookmarkHandlers>;
