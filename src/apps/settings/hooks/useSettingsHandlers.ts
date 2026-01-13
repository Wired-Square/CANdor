// ui/src/apps/settings/hooks/useSettingsHandlers.ts
// Orchestrator hook that composes all domain handlers

import { useIOProfileHandlers, type IOProfileHandlers } from './handlers/useIOProfileHandlers';
import {
  useSettingsCatalogHandlers,
  type SettingsCatalogHandlers,
} from './handlers/useSettingsCatalogHandlers';
import {
  useBookmarkHandlers,
  type BookmarkHandlers,
} from './handlers/useBookmarkHandlers';

export interface UseSettingsHandlersParams {
  // Form state from useSettingsForms
  catalogName: string;
  catalogFilename: string;
  setCatalogName: (name: string) => void;
  setCatalogFilename: (filename: string) => void;
  resetCatalogForm: () => void;
  initDuplicateCatalogForm: (name: string, filename: string) => void;
  initEditCatalogForm: (name: string, filename: string) => void;

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

export type SettingsHandlers = IOProfileHandlers & SettingsCatalogHandlers & BookmarkHandlers;

export function useSettingsHandlers(params: UseSettingsHandlersParams): SettingsHandlers {
  // IO Profile handlers (no params needed - uses store directly)
  const ioProfileHandlers = useIOProfileHandlers();

  // Catalog handlers
  const catalogHandlers = useSettingsCatalogHandlers({
    catalogName: params.catalogName,
    catalogFilename: params.catalogFilename,
    setCatalogName: params.setCatalogName,
    setCatalogFilename: params.setCatalogFilename,
    resetCatalogForm: params.resetCatalogForm,
    initDuplicateCatalogForm: params.initDuplicateCatalogForm,
    initEditCatalogForm: params.initEditCatalogForm,
  });

  // Bookmark handlers
  const bookmarkHandlers = useBookmarkHandlers({
    bookmarkName: params.bookmarkName,
    bookmarkStartTime: params.bookmarkStartTime,
    bookmarkEndTime: params.bookmarkEndTime,
    bookmarkMaxFrames: params.bookmarkMaxFrames,
    resetBookmarkForm: params.resetBookmarkForm,
    initEditBookmarkForm: params.initEditBookmarkForm,
  });

  // Spread all handlers into a flat object
  return {
    ...ioProfileHandlers,
    ...catalogHandlers,
    ...bookmarkHandlers,
  };
}
