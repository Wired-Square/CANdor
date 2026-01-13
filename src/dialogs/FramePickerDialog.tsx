// ui/src/dialogs/FramePickerDialog.tsx

import { X } from "lucide-react";
import Dialog from "../components/Dialog";
import FramePicker from "../components/FramePicker";
import type { FrameInfo } from "../types/common";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  frames: FrameInfo[];
  selectedFrames: Set<number>;
  onToggleFrame: (id: number) => void;
  onBulkSelect: (bus: number, select: boolean) => void;
  displayFrameIdFormat: "hex" | "decimal";
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  activeSelectionSetId?: string | null;
  selectionSetDirty?: boolean;
  onSaveSelectionSet?: () => void;
  onOpenSelectionSetPicker?: () => void;
};

export default function FramePickerDialog({
  isOpen,
  onClose,
  frames,
  selectedFrames,
  onToggleFrame,
  onBulkSelect,
  displayFrameIdFormat,
  onSelectAll,
  onDeselectAll,
  activeSelectionSetId,
  selectionSetDirty,
  onSaveSelectionSet,
  onOpenSelectionSetPicker,
}: Props) {
  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Select Frames
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <FramePicker
            frames={frames}
            selected={selectedFrames}
            onToggle={onToggleFrame}
            onBulkSelect={onBulkSelect}
            displayFrameIdFormat={displayFrameIdFormat}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
            activeSelectionSetId={activeSelectionSetId}
            selectionSetDirty={selectionSetDirty}
            onSaveSelectionSet={onSaveSelectionSet}
            onOpenSelectionSetPicker={onOpenSelectionSetPicker}
            defaultExpanded={true}
            noInnerScroll={true}
          />
        </div>
      </div>
    </Dialog>
  );
}
