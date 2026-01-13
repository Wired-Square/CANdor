// ui/src/hooks/useDecoderSelectors.ts
// Grouped selector hooks for Decoder store to reduce boilerplate

import { useDecoderStore } from "../stores/decoderStore";

/**
 * Catalog state
 */
export function useDecoderCatalog() {
  const catalogPath = useDecoderStore((s) => s.catalogPath);
  const frames = useDecoderStore((s) => s.frames);
  const loadCatalog = useDecoderStore((s) => s.loadCatalog);

  return { catalogPath, frames, loadCatalog };
}

/**
 * Frame selection state and actions
 */
export function useDecoderFrameState() {
  const selectedFrames = useDecoderStore((s) => s.selectedFrames);
  const decoded = useDecoderStore((s) => s.decoded);
  const showRawBytes = useDecoderStore((s) => s.showRawBytes);

  return { selectedFrames, decoded, showRawBytes };
}

/**
 * Frame selection actions
 */
export function useDecoderFrameActions() {
  const toggleFrameSelection = useDecoderStore((s) => s.toggleFrameSelection);
  const bulkSelectBus = useDecoderStore((s) => s.bulkSelectBus);
  const selectAllFrames = useDecoderStore((s) => s.selectAllFrames);
  const deselectAllFrames = useDecoderStore((s) => s.deselectAllFrames);
  const decodeSignals = useDecoderStore((s) => s.decodeSignals);
  const toggleShowRawBytes = useDecoderStore((s) => s.toggleShowRawBytes);

  return {
    toggleFrameSelection,
    bulkSelectBus,
    selectAllFrames,
    deselectAllFrames,
    decodeSignals,
    toggleShowRawBytes,
  };
}

/**
 * Playback state
 */
export function useDecoderPlaybackState() {
  const ioProfile = useDecoderStore((s) => s.ioProfile);
  const playbackSpeed = useDecoderStore((s) => s.playbackSpeed);
  const startTime = useDecoderStore((s) => s.startTime);
  const endTime = useDecoderStore((s) => s.endTime);
  const currentTime = useDecoderStore((s) => s.currentTime);

  return { ioProfile, playbackSpeed, startTime, endTime, currentTime };
}

/**
 * Playback actions
 */
export function useDecoderPlaybackActions() {
  const setIoProfile = useDecoderStore((s) => s.setIoProfile);
  const setPlaybackSpeed = useDecoderStore((s) => s.setPlaybackSpeed);
  const setStartTime = useDecoderStore((s) => s.setStartTime);
  const setEndTime = useDecoderStore((s) => s.setEndTime);
  const updateCurrentTime = useDecoderStore((s) => s.updateCurrentTime);

  return {
    setIoProfile,
    setPlaybackSpeed,
    setStartTime,
    setEndTime,
    updateCurrentTime,
  };
}

/**
 * Selection set state and actions
 */
export function useDecoderSelectionSet() {
  const activeSelectionSetId = useDecoderStore((s) => s.activeSelectionSetId);
  const selectionSetDirty = useDecoderStore((s) => s.selectionSetDirty);
  const setActiveSelectionSet = useDecoderStore((s) => s.setActiveSelectionSet);
  const setSelectionSetDirty = useDecoderStore((s) => s.setSelectionSetDirty);
  const applySelectionSet = useDecoderStore((s) => s.applySelectionSet);

  return {
    activeSelectionSetId,
    selectionSetDirty,
    setActiveSelectionSet,
    setSelectionSetDirty,
    applySelectionSet,
  };
}

/**
 * Init action
 */
export function useDecoderInit() {
  const initFromSettings = useDecoderStore((s) => s.initFromSettings);

  return { initFromSettings };
}
