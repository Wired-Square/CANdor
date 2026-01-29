// ui/src/dialogs/SelectionSetPickerDialog.tsx
// Dialog for managing and loading selection sets

import { useState, useEffect } from "react";
import { Trash2, X } from "lucide-react";
import { iconMd, iconLg, flexRowGap2 } from "../styles/spacing";
import { labelSmall, captionMuted, sectionHeaderText } from "../styles/typography";
import { borderDivider, bgSecondary, hoverLight } from "../styles";
import Dialog from "../components/Dialog";
import {
  getAllSelectionSets,
  updateSelectionSet,
  deleteSelectionSet,
  type SelectionSet,
} from "../utils/selectionSets";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (selectionSet: SelectionSet) => void;
  /** Called when the user wants to clear the active selection set */
  onClear?: () => void;
  /** Called when selection sets are modified (so caller can refresh) */
  onSelectionSetsChanged?: () => void;
};

export default function SelectionSetPickerDialog({
  isOpen,
  onClose,
  onLoad,
  onClear,
  onSelectionSetsChanged,
}: Props) {
  const [selectionSets, setSelectionSets] = useState<SelectionSet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load selection sets when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSelectionSets();
    } else {
      // Reset state when closing
      setSelectedId(null);
      setEditForm({ name: "" });
    }
  }, [isOpen]);

  const loadSelectionSets = async () => {
    setIsLoading(true);
    try {
      const all = await getAllSelectionSets();
      // Sort by name
      all.sort((a, b) => a.name.localeCompare(b.name));
      setSelectionSets(all);
    } catch (err) {
      console.error("Failed to load selection sets:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSet = (set: SelectionSet) => {
    setSelectedId(set.id);
    setEditForm({
      name: set.name,
    });
  };

  const handleSave = async () => {
    if (!selectedId) return;

    setIsSaving(true);
    try {
      await updateSelectionSet(selectedId, {
        name: editForm.name,
      });
      await loadSelectionSets();
      onSelectionSetsChanged?.();
    } catch (err) {
      console.error("Failed to save selection set:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;

    try {
      await deleteSelectionSet(selectedId);
      setSelectedId(null);
      setEditForm({ name: "" });
      await loadSelectionSets();
      onSelectionSetsChanged?.();
    } catch (err) {
      console.error("Failed to delete selection set:", err);
    }
  };

  const handleLoad = () => {
    const set = selectionSets.find((s) => s.id === selectedId);
    if (set) {
      onLoad(set);
      onClose();
    }
  };

  const handleClear = () => {
    onClear?.();
    onClose();
  };

  const selectedSet = selectionSets.find((s) => s.id === selectedId);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-2xl">
      <div className="flex flex-col h-[500px]">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 ${borderDivider}`}>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Selection Sets
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ${hoverLight}`}
          >
            <X className={iconLg} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Selection Set List */}
          <div className="w-1/2 border-r border-slate-200 dark:border-slate-700 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading...</div>
            ) : selectionSets.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">
                No selection sets saved yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectionSets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => handleSelectSet(set)}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      selectedId === set.id
                        ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500"
                        : ""
                    }`}
                  >
                    <div className={sectionHeaderText}>
                      {set.name}
                    </div>
                    <div className={`${captionMuted} mt-0.5`}>
                      {set.selectedIds?.length ?? set.frameIds.length}/{set.frameIds.length} selected
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Edit Form */}
          <div className="w-1/2 p-4">
            {selectedSet ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={labelSmall}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelSmall}>
                    Frames
                  </label>
                  <div className={`px-3 py-2 text-sm rounded border border-slate-200 dark:border-slate-700 ${bgSecondary} text-slate-600 dark:text-slate-300`}>
                    {selectedSet.selectedIds?.length ?? selectedSet.frameIds.length}/{selectedSet.frameIds.length} selected
                  </div>
                </div>

                <div className="space-y-1">
                  <label className={labelSmall}>
                    Created
                  </label>
                  <div className={`px-3 py-2 text-sm rounded border border-slate-200 dark:border-slate-700 ${bgSecondary} text-slate-600 dark:text-slate-300`}>
                    {formatDate(selectedSet.createdAt)}
                  </div>
                </div>

                {selectedSet.lastUsedAt && (
                  <div className="space-y-1">
                    <label className={labelSmall}>
                      Last Used
                    </label>
                    <div className={`px-3 py-2 text-sm rounded border border-slate-200 dark:border-slate-700 ${bgSecondary} text-slate-600 dark:text-slate-300`}>
                      {formatDate(selectedSet.lastUsedAt)}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className={iconMd} />
                    Delete
                  </button>
                  <div className={flexRowGap2}>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className={`px-4 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 ${hoverLight} disabled:opacity-50`}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={handleLoad}
                      className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Load
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Select a set to edit or load
              </div>
            )}
          </div>
        </div>

        {/* Footer with Clear button */}
        {onClear && (
          <div className="flex items-center justify-end px-4 py-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleClear}
              className={`px-4 py-1.5 text-sm font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 ${hoverLight}`}
            >
              Clear Selection Set
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
