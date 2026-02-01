// ui/src/apps/settings/hooks/useSettingsForms.ts

import { useState, useCallback } from 'react';
import type { TimeBounds } from '../../../components/TimeBoundsInput';

export interface CatalogFormState {
  name: string;
  filename: string;
}

const defaultTimeBounds: TimeBounds = {
  startTime: '',
  endTime: '',
  maxFrames: undefined,
  timezoneMode: 'local',
};

export function useSettingsForms() {
  // Catalog dialog form (used for both duplicate and edit)
  const [catalogName, setCatalogName] = useState('');
  const [catalogFilename, setCatalogFilename] = useState('');

  // Bookmark dialog form (for editing)
  const [bookmarkName, setBookmarkName] = useState('');
  const [bookmarkTimeBounds, setBookmarkTimeBounds] = useState<TimeBounds>(defaultTimeBounds);

  // New bookmark dialog form (for creating)
  const [newBookmarkProfileId, setNewBookmarkProfileId] = useState('');
  const [newBookmarkName, setNewBookmarkName] = useState('');
  const [newBookmarkTimeBounds, setNewBookmarkTimeBounds] = useState<TimeBounds>(defaultTimeBounds);

  // Reset helpers
  const resetCatalogForm = () => {
    setCatalogName('');
    setCatalogFilename('');
  };

  const resetBookmarkForm = useCallback(() => {
    setBookmarkName('');
    setBookmarkTimeBounds(defaultTimeBounds);
  }, []);

  const resetNewBookmarkForm = useCallback(() => {
    setNewBookmarkProfileId('');
    setNewBookmarkName('');
    setNewBookmarkTimeBounds(defaultTimeBounds);
  }, []);

  // Initialize catalog form for duplication
  const initDuplicateCatalogForm = (name: string, filename: string) => {
    setCatalogName(name + ' (Copy)');
    setCatalogFilename(filename.replace('.toml', '-copy.toml'));
  };

  // Initialize catalog form for editing
  const initEditCatalogForm = (name: string, filename: string) => {
    setCatalogName(name);
    setCatalogFilename(filename);
  };

  // Initialize bookmark form for editing
  const initEditBookmarkForm = useCallback((
    name: string,
    startTime: string,
    endTime: string,
    maxFrames?: number
  ) => {
    setBookmarkName(name);
    setBookmarkTimeBounds({
      startTime,
      endTime,
      maxFrames,
      timezoneMode: 'local',
    });
  }, []);

  // Initialize new bookmark form with default profile
  const initNewBookmarkForm = useCallback((defaultProfileId: string) => {
    setNewBookmarkProfileId(defaultProfileId);
    setNewBookmarkName('');
    setNewBookmarkTimeBounds(defaultTimeBounds);
  }, []);

  // Handle time bounds changes
  const handleBookmarkTimeBoundsChange = useCallback((bounds: TimeBounds) => {
    setBookmarkTimeBounds(bounds);
  }, []);

  const handleNewBookmarkTimeBoundsChange = useCallback((bounds: TimeBounds) => {
    setNewBookmarkTimeBounds(bounds);
  }, []);

  return {
    // Catalog form
    catalogName,
    setCatalogName,
    catalogFilename,
    setCatalogFilename,
    resetCatalogForm,
    initDuplicateCatalogForm,
    initEditCatalogForm,

    // Bookmark form (editing)
    bookmarkName,
    setBookmarkName,
    bookmarkTimeBounds,
    setBookmarkTimeBounds: handleBookmarkTimeBoundsChange,
    resetBookmarkForm,
    initEditBookmarkForm,

    // New bookmark form (creating)
    newBookmarkProfileId,
    setNewBookmarkProfileId,
    newBookmarkName,
    setNewBookmarkName,
    newBookmarkTimeBounds,
    setNewBookmarkTimeBounds: handleNewBookmarkTimeBoundsChange,
    resetNewBookmarkForm,
    initNewBookmarkForm,
  };
}

export type SettingsFormsState = ReturnType<typeof useSettingsForms>;
