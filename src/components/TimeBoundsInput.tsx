// ui/src/components/TimeBoundsInput.tsx
//
// Reusable time bounds input component with optional bookmark pre-fill.
// Used in Query app (with bookmarks) and BookmarkEditorDialog (without bookmarks).

import { useCallback, useMemo } from "react";
import { Globe } from "lucide-react";
import { iconXs } from "../styles/spacing";
import { caption } from "../styles/typography";
import { bgSurface } from "../styles/colourTokens";
import { getLocalTimezoneAbbr, convertDatetimeLocal } from "./TimezoneBadge";
import { useSettingsStore } from "../apps/settings/stores/settingsStore";
import type { TimeRangeFavorite } from "../utils/favorites";

/** The resolved time bounds emitted by the component */
export interface TimeBounds {
  /** Start time in datetime-local format */
  startTime: string;
  /** End time in datetime-local format (empty string = no end bound) */
  endTime: string;
  /** Maximum number of frames (undefined = no limit) */
  maxFrames?: number;
  /** The timezone mode used for the times */
  timezoneMode: "local" | "utc";
  /** Name of the selected bookmark (cleared when fields are manually modified) */
  bookmarkName?: string;
}

export interface TimeBoundsInputProps {
  /** Current time bounds (controlled component) */
  value: TimeBounds;
  /** Called when time bounds change */
  onChange: (bounds: TimeBounds) => void;
  /** Available bookmarks to select from */
  bookmarks?: TimeRangeFavorite[];
  /** Whether to show the bookmark dropdown (default: true) */
  showBookmarks?: boolean;
  /** Whether the component is disabled */
  disabled?: boolean;
}

export default function TimeBoundsInput({
  value,
  onChange,
  bookmarks = [],
  showBookmarks = true,
  disabled = false,
}: TimeBoundsInputProps) {
  const defaultTz = useSettingsStore((s) => s.display.timezone);
  const localTzAbbr = useMemo(() => getLocalTimezoneAbbr(), []);

  // Handle bookmark selection - pre-fill the fields and remember the name
  const handleBookmarkChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const bookmarkId = e.target.value;
      if (!bookmarkId) {
        // Clear bookmark selection
        onChange({ ...value, bookmarkName: undefined });
        return;
      }

      const bookmark = bookmarks.find((b) => b.id === bookmarkId);
      if (!bookmark) return;

      // Pre-fill fields and set bookmark name
      onChange({
        startTime: bookmark.startTime,
        endTime: bookmark.endTime,
        maxFrames: bookmark.maxFrames,
        timezoneMode: value.timezoneMode,
        bookmarkName: bookmark.name,
      });
    },
    [bookmarks, value, onChange]
  );

  // Handle timezone mode change - convert existing times
  const handleTimezoneChange = useCallback(
    (newMode: "local" | "utc") => {
      if (newMode === value.timezoneMode) return;

      const newStart = convertDatetimeLocal(
        value.startTime,
        value.timezoneMode,
        newMode,
        defaultTz
      );
      const newEnd = convertDatetimeLocal(
        value.endTime,
        value.timezoneMode,
        newMode,
        defaultTz
      );

      onChange({
        ...value,
        startTime: newStart,
        endTime: newEnd,
        timezoneMode: newMode,
      });
    },
    [value, defaultTz, onChange]
  );

  // Handle individual field changes - clear bookmark name when manually edited
  const handleStartTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, startTime: e.target.value, bookmarkName: undefined });
    },
    [value, onChange]
  );

  const handleEndTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, endTime: e.target.value, bookmarkName: undefined });
    },
    [value, onChange]
  );

  const handleMaxFramesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = e.target.value ? Number(e.target.value) : undefined;
      onChange({ ...value, maxFrames: num, bookmarkName: undefined });
    },
    [value, onChange]
  );

  const inputClasses = `w-full px-2 py-1.5 text-xs rounded border border-[color:var(--border-default)] ${bgSurface} text-[color:var(--text-secondary)]`;

  return (
    <div className="space-y-3">
      {/* Bookmarks dropdown (optional) */}
      {showBookmarks && bookmarks.length > 0 && (
        <div>
          <label className={`block ${caption} mb-1`}>Bookmarks</label>
          <select
            value={bookmarks.find((b) => b.name === value.bookmarkName)?.id ?? ""}
            onChange={handleBookmarkChange}
            disabled={disabled}
            className={inputClasses}
          >
            <option value="">Select a bookmark...</option>
            {bookmarks.map((bm) => (
              <option key={bm.id} value={bm.id}>
                {bm.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Timezone toggle */}
      <div className="flex items-center justify-between">
        <label className={caption}>Time Zone</label>
        <div className="flex items-center gap-1 bg-[var(--hover-bg)] rounded p-0.5">
          <button
            type="button"
            onClick={() => handleTimezoneChange("local")}
            disabled={disabled}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              value.timezoneMode === "local"
                ? "bg-[var(--bg-primary)] text-[color:var(--text-primary)] shadow-sm"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
            } disabled:opacity-50`}
          >
            {localTzAbbr}
          </button>
          <button
            type="button"
            onClick={() => handleTimezoneChange("utc")}
            disabled={disabled}
            className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 ${
              value.timezoneMode === "utc"
                ? "bg-[var(--bg-primary)] text-[color:var(--text-primary)] shadow-sm"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]"
            } disabled:opacity-50`}
          >
            <Globe className={iconXs} />
            UTC
          </button>
        </div>
      </div>

      {/* Start/End time inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={`block ${caption} mb-1`}>Start Time</label>
          <input
            type="datetime-local"
            step="1"
            value={value.startTime}
            onChange={handleStartTimeChange}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
        <div>
          <label className={`block ${caption} mb-1`}>End Time</label>
          <input
            type="datetime-local"
            step="1"
            value={value.endTime}
            onChange={handleEndTimeChange}
            disabled={disabled}
            className={inputClasses}
          />
        </div>
      </div>

      {/* Max frames input */}
      <div>
        <label className={`block ${caption} mb-1`}>Max Frames</label>
        <input
          type="number"
          min={1}
          placeholder="No limit"
          value={value.maxFrames ?? ""}
          onChange={handleMaxFramesChange}
          disabled={disabled}
          className={inputClasses}
        />
      </div>
    </div>
  );
}
