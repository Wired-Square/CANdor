// ui/src/apps/settings/hooks/handlers/useBookmarkHandlers.ts

import {
  updateFavorite,
  deleteFavorite,
  type TimeRangeFavorite,
} from '../../../../utils/favorites';
import { useSettingsStore } from '../../stores/settingsStore';

export interface UseBookmarkHandlersParams {
  // Form state from useSettingsForms
  bookmarkName: string;
  bookmarkStartTime: string;
  bookmarkEndTime: string;
  bookmarkMaxFrames: string;
  resetBookmarkForm: () => void;
  initEditBookmarkForm: (
    name: string,
    startTime: string,
    endTime: string,
    maxFrames?: number
  ) => void;
}

export function useBookmarkHandlers({
  bookmarkName,
  bookmarkStartTime,
  bookmarkEndTime,
  bookmarkMaxFrames,
  resetBookmarkForm,
  initEditBookmarkForm,
}: UseBookmarkHandlersParams) {
  // Store selectors
  const dialogPayload = useSettingsStore((s) => s.ui.dialogPayload);

  // Store actions
  const loadBookmarks = useSettingsStore((s) => s.loadBookmarks);
  const openDialog = useSettingsStore((s) => s.openDialog);
  const closeDialog = useSettingsStore((s) => s.closeDialog);
  const setDialogPayload = useSettingsStore((s) => s.setDialogPayload);

  // Open edit dialog
  const handleEditBookmark = (bookmark: TimeRangeFavorite) => {
    setDialogPayload({ bookmarkToEdit: bookmark });
    initEditBookmarkForm(
      bookmark.name,
      bookmark.startTime,
      bookmark.endTime,
      bookmark.maxFrames
    );
    openDialog('editBookmark');
  };

  // Confirm edit
  const handleConfirmEditBookmark = async () => {
    const bookmark = dialogPayload.bookmarkToEdit;
    if (!bookmark) return;

    try {
      const maxFramesValue =
        bookmarkMaxFrames === '' ? undefined : Number(bookmarkMaxFrames);

      await updateFavorite(bookmark.id, {
        name: bookmarkName,
        startTime: bookmarkStartTime,
        endTime: bookmarkEndTime,
        maxFrames: maxFramesValue,
      });

      await loadBookmarks();
      closeDialog('editBookmark');
      setDialogPayload({ bookmarkToEdit: null });
      resetBookmarkForm();
    } catch (error) {
      console.error('Failed to update bookmark:', error);
    }
  };

  // Cancel edit
  const handleCancelEditBookmark = () => {
    closeDialog('editBookmark');
    setDialogPayload({ bookmarkToEdit: null });
    resetBookmarkForm();
  };

  // Open delete confirmation dialog
  const handleDeleteBookmark = (bookmark: TimeRangeFavorite) => {
    setDialogPayload({ bookmarkToDelete: bookmark });
    openDialog('deleteBookmark');
  };

  // Confirm deletion
  const handleConfirmDeleteBookmark = async () => {
    const bookmark = dialogPayload.bookmarkToDelete;
    if (!bookmark) return;

    try {
      await deleteFavorite(bookmark.id);
      await loadBookmarks();
      closeDialog('deleteBookmark');
      setDialogPayload({ bookmarkToDelete: null });
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
    }
  };

  // Cancel deletion
  const handleCancelDeleteBookmark = () => {
    closeDialog('deleteBookmark');
    setDialogPayload({ bookmarkToDelete: null });
  };

  return {
    handleEditBookmark,
    handleConfirmEditBookmark,
    handleCancelEditBookmark,
    handleDeleteBookmark,
    handleConfirmDeleteBookmark,
    handleCancelDeleteBookmark,
  };
}

export type BookmarkHandlers = ReturnType<typeof useBookmarkHandlers>;
