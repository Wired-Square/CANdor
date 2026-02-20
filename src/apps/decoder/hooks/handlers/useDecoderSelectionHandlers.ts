// ui/src/apps/decoder/hooks/handlers/useDecoderSelectionHandlers.ts
//
// Selection set handlers for Decoder: thin wrapper around shared hook.

import { useSelectionSetHandlers } from "../../../../hooks/useSelectionSetHandlers";
import type { SelectionSet } from "../../../../utils/selectionSets";
import type { FrameDetail } from "../../../../types/decoder";

export interface UseDecoderSelectionHandlersParams {
  // Store state
  frames: Map<number, FrameDetail>;
  selectedFrames: Set<number>;
  activeSelectionSetId: string | null;
  selectionSetDirty: boolean;

  // Store actions
  setActiveSelectionSet: (id: string | null) => void;
  setSelectionSetDirty: (dirty: boolean) => void;
  applySelectionSet: (selectionSet: SelectionSet) => void;

  // Dialog controls
  openSaveSelectionSet: () => void;

  /** Called after a selection set is saved or updated */
  onAfterMutate?: () => void;
}

export function useDecoderSelectionHandlers({
  frames,
  selectedFrames,
  activeSelectionSetId,
  selectionSetDirty,
  setActiveSelectionSet,
  setSelectionSetDirty,
  applySelectionSet,
  openSaveSelectionSet,
  onAfterMutate,
}: UseDecoderSelectionHandlersParams) {
  return useSelectionSetHandlers({
    frameMap: frames,
    selectedFrames,
    activeSelectionSetId,
    selectionSetDirty,
    setActiveSelectionSet,
    setSelectionSetDirty,
    applySelectionSet,
    openSaveDialog: openSaveSelectionSet,
    onAfterMutate,
  });
}

export type DecoderSelectionHandlers = ReturnType<typeof useDecoderSelectionHandlers>;
