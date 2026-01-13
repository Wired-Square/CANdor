// ui/src/apps/decoder/dialogs/FilterDialog.tsx

import { useState, useEffect } from "react";
import Dialog from "../../../components/Dialog";
import { DialogFooter } from "../../../components/forms/DialogFooter";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  minFrameLength: number;
  frameIdFilter: string;
  onSave: (minFrameLength: number, frameIdFilter: string) => void;
};

export default function FilterDialog({
  isOpen,
  onClose,
  minFrameLength,
  frameIdFilter,
  onSave,
}: Props) {
  const [lengthValue, setLengthValue] = useState(minFrameLength);
  const [idFilter, setIdFilter] = useState(frameIdFilter);

  // Reset values when dialog opens
  useEffect(() => {
    if (isOpen) {
      setLengthValue(minFrameLength);
      setIdFilter(frameIdFilter);
    }
  }, [isOpen, minFrameLength, frameIdFilter]);

  const handleSave = () => {
    onSave(lengthValue, idFilter);
    onClose();
  };

  const handleClear = () => {
    onSave(0, '');
    onClose();
  };

  const hasFilters = minFrameLength > 0 || frameIdFilter.trim() !== '';

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-sm">
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Frame Filters
        </h2>

        {/* Frame ID Filter */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Frame IDs (hex)
          </label>
          <input
            type="text"
            value={idFilter}
            onChange={(e) => setIdFilter(e.target.value)}
            placeholder="e.g., 0x100-0x109, 0x151"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Frames with matching IDs will be moved to the Filtered tab.
            Supports comma-separated values and ranges (e.g., 0x100-0x109, 0x151).
          </p>
        </div>

        {/* Minimum Frame Length */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Minimum frame length (bytes)
          </label>
          <input
            type="number"
            min={0}
            max={255}
            value={lengthValue}
            onChange={(e) => setLengthValue(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Frames shorter than this will be filtered out and shown in the Filtered tab.
            Set to 0 to disable length filtering.
          </p>
        </div>

        <DialogFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel="Apply"
          leftContent={
            hasFilters ? (
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-sm rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Clear All
              </button>
            ) : undefined
          }
        />
      </div>
    </Dialog>
  );
}
