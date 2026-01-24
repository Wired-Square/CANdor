// ui/src/dialogs/BookmarkEditorDialog.tsx
// Global bookmark editor dialog for managing and loading time range bookmarks

import { useState, useEffect, useMemo } from "react";
import { Play, Trash2, X } from "lucide-react";
import Dialog from "../components/Dialog";
import { Input, SecondaryButton, PrimaryButton, DangerButton } from "../components/forms";
import { h2, labelSmall, borderDefault } from "../styles";
import {
  getAllFavorites,
  updateFavorite,
  deleteFavorite,
  type TimeRangeFavorite,
} from "../utils/favorites";

/** Get the local timezone abbreviation (e.g., "AEDT", "PST") */
function getLocalTimezoneAbbr(): string {
  const formatter = new Intl.DateTimeFormat("en", { timeZoneName: "short" });
  const parts = formatter.formatToParts(new Date());
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  return tzPart?.value || "Local";
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Called when a bookmark is loaded */
  onLoad?: (bookmark: TimeRangeFavorite) => void;
  /** Called when bookmarks are modified (so caller can refresh) */
  onBookmarksChanged?: () => void;
  /** Filter bookmarks to only show those for this profile */
  profileId?: string | null;
};

export default function BookmarkEditorDialog({
  isOpen,
  onClose,
  onLoad,
  onBookmarksChanged,
  profileId,
}: Props) {
  const [bookmarks, setBookmarks] = useState<TimeRangeFavorite[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    startTime: "",
    endTime: "",
    maxFrames: "" as string | number,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Memoize timezone abbreviation
  const localTzAbbr = useMemo(() => getLocalTimezoneAbbr(), []);

  // Load bookmarks when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadBookmarks();
    } else {
      // Reset state when closing
      setSelectedId(null);
      setEditForm({ name: "", startTime: "", endTime: "", maxFrames: "" });
    }
  }, [isOpen]);

  const loadBookmarks = async () => {
    setIsLoading(true);
    try {
      let all = await getAllFavorites();
      // Filter by profile if provided
      if (profileId) {
        all = all.filter((b) => b.profileId === profileId);
      }
      // Sort by name
      all.sort((a, b) => a.name.localeCompare(b.name));
      setBookmarks(all);
    } catch (err) {
      console.error("Failed to load bookmarks:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBookmark = (bookmark: TimeRangeFavorite) => {
    setSelectedId(bookmark.id);
    setEditForm({
      name: bookmark.name,
      startTime: bookmark.startTime,
      endTime: bookmark.endTime,
      maxFrames: bookmark.maxFrames ?? "",
    });
  };

  const handleSave = async () => {
    if (!selectedId) return;

    setIsSaving(true);
    try {
      const maxFramesValue = editForm.maxFrames === "" ? undefined : Number(editForm.maxFrames);
      await updateFavorite(selectedId, {
        name: editForm.name,
        startTime: editForm.startTime,
        endTime: editForm.endTime,
        maxFrames: maxFramesValue,
      });
      await loadBookmarks();
      onBookmarksChanged?.();
    } catch (err) {
      console.error("Failed to save bookmark:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;

    try {
      await deleteFavorite(selectedId);
      setSelectedId(null);
      setEditForm({ name: "", startTime: "", endTime: "", maxFrames: "" });
      await loadBookmarks();
      onBookmarksChanged?.();
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
    }
  };

  const handleLoad = () => {
    const bookmark = bookmarks.find((b) => b.id === selectedId);
    if (bookmark && onLoad) {
      onLoad(bookmark);
      onClose();
    }
  };

  const selectedBookmark = bookmarks.find((b) => b.id === selectedId);

  // Group bookmarks by profile for display (only if not filtering by profile)
  const bookmarksByProfile = profileId
    ? { [profileId]: bookmarks }
    : bookmarks.reduce(
        (acc, b) => {
          if (!acc[b.profileId]) {
            acc[b.profileId] = [];
          }
          acc[b.profileId].push(b);
          return acc;
        },
        {} as Record<string, TimeRangeFavorite[]>
      );

  const formatTimeRange = (bookmark: TimeRangeFavorite) => {
    const start = bookmark.startTime.replace("T", " ");
    const end = bookmark.endTime.replace("T", " ");
    return `${start} → ${end}`;
  };

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-2xl">
      <div className="flex flex-col h-[500px]">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${borderDefault}`}>
          <h2 className={h2}>Bookmarks</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Left: Bookmark List */}
          <div className={`w-1/2 border-r ${borderDefault} overflow-y-auto`}>
            {isLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading...</div>
            ) : bookmarks.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">
                No bookmarks saved yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(bookmarksByProfile).map(([pid, profileBookmarks]) => (
                  <div key={pid}>
                    {!profileId && (
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {pid}
                      </div>
                    )}
                    {profileBookmarks.map((bookmark) => (
                      <div
                        key={bookmark.id}
                        className={`flex items-center w-full hover:bg-slate-50 dark:hover:bg-slate-800 ${
                          selectedId === bookmark.id
                            ? "bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500"
                            : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectBookmark(bookmark)}
                          className="flex-1 text-left px-3 py-2"
                        >
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {bookmark.name}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {formatTimeRange(bookmark)}
                          </div>
                        </button>
                        {onLoad && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoad(bookmark);
                              onClose();
                            }}
                            title="Load bookmark"
                            className="p-2 mr-1 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Edit Form */}
          <div className="w-1/2 p-4">
            {selectedBookmark ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={labelSmall}>Name</label>
                  <Input
                    variant="simple"
                    type="text"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelSmall}>From ({localTzAbbr})</label>
                  <Input
                    variant="simple"
                    type="datetime-local"
                    step="1"
                    value={editForm.startTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelSmall}>To ({localTzAbbr})</label>
                  <Input
                    variant="simple"
                    type="datetime-local"
                    step="1"
                    value={editForm.endTime}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <label className={labelSmall}>Max Frames</label>
                  <Input
                    variant="simple"
                    type="number"
                    min={0}
                    placeholder="No limit"
                    value={editForm.maxFrames}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, maxFrames: e.target.value }))
                    }
                  />
                </div>

                {!profileId && (
                  <div className="space-y-1">
                    <label className={labelSmall}>Profile</label>
                    <div className={`px-3 py-2 text-sm rounded border ${borderDefault} bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300`}>
                      {selectedBookmark.profileId}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <DangerButton onClick={handleDelete}>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </DangerButton>
                  <div className="flex items-center gap-2">
                    <SecondaryButton onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save"}
                    </SecondaryButton>
                    {onLoad && (
                      <PrimaryButton onClick={handleLoad}>Load</PrimaryButton>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-400">
                Select a bookmark to edit or load
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
