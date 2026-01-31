// src/apps/query/views/QueryBuilderPanel.tsx
//
// Query configuration panel. Users select query type, frame ID, byte index,
// and context window settings. Supports favourite-based time bounds.

import { useCallback, useState, useEffect, useMemo } from "react";
import { ListPlus, Loader2, Bookmark } from "lucide-react";
import {
  useQueryStore,
  QUERY_TYPE_INFO,
  CONTEXT_PRESETS,
  type QueryType,
} from "../stores/queryStore";
import { useSettingsStore } from "../../settings/stores/settingsStore";
import type { TimeRangeFavorite } from "../../../utils/favorites";
import { primaryButtonBase, buttonBase } from "../../../styles/buttonStyles";
import { inputBase } from "../../../styles/inputStyles";
import { labelSmallMuted, monoBody } from "../../../styles/typography";
import { iconSm, flexRowGap2 } from "../../../styles/spacing";
import { bgSurface, borderDefault, textPrimary, textSecondary, textMuted } from "../../../styles/colourTokens";

interface Props {
  profileId: string | null;
  disabled?: boolean;
  favourites: TimeRangeFavorite[];
  selectedFavouriteId: string | null;
  onFavouriteSelect: (id: string | null) => void;
  onSwitchToQueue: () => void;
}

export default function QueryBuilderPanel({
  profileId,
  disabled = false,
  favourites,
  selectedFavouriteId,
  onFavouriteSelect,
  onSwitchToQueue,
}: Props) {
  // Store selectors
  const queryType = useQueryStore((s) => s.queryType);
  const queryParams = useQueryStore((s) => s.queryParams);
  const contextWindow = useQueryStore((s) => s.contextWindow);
  const isRunning = useQueryStore((s) => s.isRunning);

  // Settings
  const queryResultLimit = useSettingsStore((s) => s.general.queryResultLimit);

  // Store actions
  const setQueryType = useQueryStore((s) => s.setQueryType);
  const updateQueryParams = useQueryStore((s) => s.updateQueryParams);
  const setContextWindow = useQueryStore((s) => s.setContextWindow);
  const enqueueQuery = useQueryStore((s) => s.enqueueQuery);

  // Get selected favourite for display
  const selectedFavourite = useMemo(
    () => favourites.find((f) => f.id === selectedFavouriteId) ?? null,
    [favourites, selectedFavouriteId]
  );

  // Local state for frame ID input (allows free typing)
  const [frameIdText, setFrameIdText] = useState(
    `0x${queryParams.frameId.toString(16).toUpperCase()}`
  );

  // Local state for result limit (allows per-query override)
  const [limitOverride, setLimitOverride] = useState(queryResultLimit);

  // Sync local state when store changes externally
  useEffect(() => {
    const storeHex = `0x${queryParams.frameId.toString(16).toUpperCase()}`;
    // Only sync if the parsed values differ (to avoid overwriting user input)
    const currentParsed = frameIdText.startsWith("0x")
      ? parseInt(frameIdText, 16)
      : parseInt(frameIdText, 10);
    if (isNaN(currentParsed) || currentParsed !== queryParams.frameId) {
      setFrameIdText(storeHex);
    }
  }, [queryParams.frameId]);

  // Sync limit override when settings change
  useEffect(() => {
    setLimitOverride(queryResultLimit);
  }, [queryResultLimit]);

  // Add to queue handler
  const handleAddToQueue = useCallback(() => {
    if (!profileId || isRunning) return;

    // Enqueue with optional favourite for time bounds and limit override
    enqueueQuery(profileId, selectedFavourite, limitOverride);

    // Switch to queue tab to show progress
    onSwitchToQueue();
  }, [profileId, isRunning, selectedFavourite, limitOverride, enqueueQuery, onSwitchToQueue]);

  // Handle favourite selection change
  const handleFavouriteChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onFavouriteSelect(value || null);
    },
    [onFavouriteSelect]
  );

  // Format time range for display
  const formatTimeRange = useCallback((startTime: string, endTime: string) => {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const formatDate = (d: Date) => {
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        const hours = d.getHours().toString().padStart(2, "0");
        const minutes = d.getMinutes().toString().padStart(2, "0");
        return `${month}-${day} ${hours}:${minutes}`;
      };
      return `${formatDate(start)} → ${formatDate(end)}`;
    } catch {
      return `${startTime} → ${endTime}`;
    }
  }, []);

  // Handle query type change
  const handleQueryTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setQueryType(e.target.value as QueryType);
    },
    [setQueryType]
  );

  // Handle frame ID change - update local state immediately, store on valid parse
  const handleFrameIdChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFrameIdText(value);

      // Support hex (0x...) or decimal
      const frameId = value.startsWith("0x")
        ? parseInt(value, 16)
        : parseInt(value, 10);
      if (!isNaN(frameId) && frameId >= 0) {
        updateQueryParams({ frameId });
      }
    },
    [updateQueryParams]
  );

  // Handle byte index change
  const handleByteIndexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const byteIndex = parseInt(e.target.value, 10);
      if (!isNaN(byteIndex) && byteIndex >= 0 && byteIndex < 64) {
        updateQueryParams({ byteIndex });
      }
    },
    [updateQueryParams]
  );

  // Handle extended ID toggle
  const handleExtendedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateQueryParams({ isExtended: e.target.checked });
    },
    [updateQueryParams]
  );

  // Handle context preset click
  const handlePresetClick = useCallback(
    (beforeMs: number, afterMs: number) => {
      setContextWindow({ beforeMs, afterMs });
    },
    [setContextWindow]
  );

  // Handle custom context window change
  const handleContextBeforeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const beforeMs = parseInt(e.target.value, 10);
      if (!isNaN(beforeMs) && beforeMs >= 0) {
        setContextWindow({ ...contextWindow, beforeMs });
      }
    },
    [contextWindow, setContextWindow]
  );

  const handleContextAfterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const afterMs = parseInt(e.target.value, 10);
      if (!isNaN(afterMs) && afterMs >= 0) {
        setContextWindow({ ...contextWindow, afterMs });
      }
    },
    [contextWindow, setContextWindow]
  );

  // Handle limit override change
  const handleLimitChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const limit = parseInt(e.target.value, 10);
      if (!isNaN(limit) && limit >= 100 && limit <= 100000) {
        setLimitOverride(limit);
      }
    },
    []
  );

  const queryInfo = QUERY_TYPE_INFO[queryType];
  const showByteIndex = queryType === "byte_changes";

  // Generate SQL query preview
  const sqlPreview = useMemo(() => {
    const frameId = queryParams.frameId;
    const isExtended = queryParams.isExtended ? 1 : 0;
    const byteIndex = queryParams.byteIndex;

    // Format time bounds if selected
    let timeConditions = "";
    if (selectedFavourite?.startTime) {
      timeConditions += `\n     AND ts >= '${selectedFavourite.startTime}'::timestamptz`;
    }
    if (selectedFavourite?.endTime) {
      timeConditions += `\n     AND ts < '${selectedFavourite.endTime}'::timestamptz`;
    }

    if (queryType === "byte_changes") {
      return `WITH ordered_frames AS (
  SELECT ts,
    get_byte_safe(data_bytes, ${byteIndex}) as curr_byte,
    LAG(get_byte_safe(data_bytes, ${byteIndex})) OVER (ORDER BY ts) as prev_byte
  FROM can_frame
  WHERE id = ${frameId} AND extended = (${isExtended} != 0)${timeConditions}
  ORDER BY ts
)
SELECT
  (EXTRACT(EPOCH FROM ts) * 1000000)::float8 as timestamp_us,
  prev_byte, curr_byte
FROM ordered_frames
WHERE prev_byte IS NOT NULL
  AND curr_byte IS NOT NULL
  AND prev_byte IS DISTINCT FROM curr_byte
ORDER BY ts
LIMIT ${limitOverride.toLocaleString()}`;
    }

    if (queryType === "frame_changes") {
      return `WITH ordered_frames AS (
  SELECT ts, data_bytes,
    LAG(data_bytes) OVER (ORDER BY ts) as prev_data
  FROM can_frame
  WHERE id = ${frameId} AND extended = (${isExtended} != 0)${timeConditions}
  ORDER BY ts
)
SELECT
  (EXTRACT(EPOCH FROM ts) * 1000000)::float8 as timestamp_us,
  prev_data, data_bytes
FROM ordered_frames
WHERE prev_data IS NOT NULL
  AND prev_data IS DISTINCT FROM data_bytes
ORDER BY ts
LIMIT ${limitOverride.toLocaleString()}`;
    }

    return `-- Query type "${queryType}" not yet implemented`;
  }, [queryType, queryParams, selectedFavourite, limitOverride]);

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Header */}
        <div>
          <h2 className={`text-sm font-semibold ${textPrimary}`}>Query Builder</h2>
          <p className={`text-xs ${textSecondary} mt-1`}>
            Configure and run queries against the database
          </p>
        </div>

        {/* Query Type */}
        <div>
          <label className={labelSmallMuted}>Query Type</label>
          <select
            value={queryType}
            onChange={handleQueryTypeChange}
            disabled={disabled || isRunning}
            className={`${inputBase} w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {Object.entries(QUERY_TYPE_INFO).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </select>
          <p className={`text-xs ${textSecondary} mt-1`}>{queryInfo.description}</p>
        </div>

        {/* Frame ID */}
        <div>
          <label className={labelSmallMuted}>Frame ID (hex or decimal)</label>
          <div className={`${flexRowGap2} mt-1`}>
            <input
              type="text"
              value={frameIdText}
              onChange={handleFrameIdChange}
              disabled={disabled || isRunning}
              placeholder="0x123 or 291"
              className={`${inputBase} flex-1 disabled:opacity-50 disabled:cursor-not-allowed`}
            />
            <label className={`${flexRowGap2} ${textSecondary} text-xs ${disabled || isRunning ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                checked={queryParams.isExtended}
                onChange={handleExtendedChange}
                disabled={disabled || isRunning}
                className="disabled:cursor-not-allowed"
              />
              Extended
            </label>
          </div>
        </div>

        {/* Byte Index (only for byte_changes query) */}
        {showByteIndex && (
          <div>
            <label className={labelSmallMuted}>Byte Index</label>
            <input
              type="number"
              min={0}
              max={63}
              value={queryParams.byteIndex}
              onChange={handleByteIndexChange}
              disabled={disabled || isRunning}
              className={`${inputBase} w-full mt-1 disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>
        )}

        {/* Context Window */}
        <div className={`${bgSurface} ${borderDefault} rounded-lg p-3`}>
          <label className={labelSmallMuted}>Context Window</label>
          <p className={`text-xs ${textSecondary} mb-2`}>
            How much data to ingest around each event
          </p>

          {/* Presets */}
          <div className="flex flex-wrap gap-1 mb-2">
            {CONTEXT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePresetClick(preset.beforeMs, preset.afterMs)}
                disabled={disabled || isRunning}
                className={`${buttonBase} text-xs px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                  contextWindow.beforeMs === preset.beforeMs &&
                  contextWindow.afterMs === preset.afterMs
                    ? "bg-amber-500/20 text-amber-400"
                    : ""
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom inputs */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={`text-xs ${textSecondary}`}>Before (ms)</label>
              <input
                type="number"
                min={0}
                value={contextWindow.beforeMs}
                onChange={handleContextBeforeChange}
                disabled={disabled || isRunning}
                className={`${inputBase} w-full mt-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            </div>
            <div className="flex-1">
              <label className={`text-xs ${textSecondary}`}>After (ms)</label>
              <input
                type="number"
                min={0}
                value={contextWindow.afterMs}
                onChange={handleContextAfterChange}
                disabled={disabled || isRunning}
                className={`${inputBase} w-full mt-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            </div>
          </div>
        </div>

        {/* Time Range from Favourite */}
        <div className={`${bgSurface} ${borderDefault} rounded-lg p-3`}>
          <div className="flex items-center gap-2 mb-2">
            <Bookmark className={iconSm} />
            <label className={labelSmallMuted}>Bound to Favourite</label>
          </div>
          <p className={`text-xs ${textSecondary} mb-2`}>
            Limit query to a saved time range
          </p>
          <select
            value={selectedFavouriteId ?? ""}
            onChange={handleFavouriteChange}
            disabled={disabled || isRunning}
            className={`${inputBase} w-full disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">All time (no bounds)</option>
            {favourites.map((fav) => (
              <option key={fav.id} value={fav.id}>
                {fav.name}
              </option>
            ))}
          </select>
          {selectedFavourite && (
            <div className={`text-xs ${textMuted} mt-2`}>
              {formatTimeRange(selectedFavourite.startTime, selectedFavourite.endTime)}
              {selectedFavourite.maxFrames && ` (max ${selectedFavourite.maxFrames} frames)`}
            </div>
          )}
          {favourites.length === 0 && (
            <p className={`text-xs ${textMuted} mt-2 italic`}>
              No favourites saved for this profile
            </p>
          )}
        </div>

        {/* SQL Query Preview */}
        <div className={`${bgSurface} ${borderDefault} rounded-lg p-3`}>
          <label className={labelSmallMuted}>SQL Query Preview</label>
          <textarea
            readOnly
            value={sqlPreview}
            className={`${monoBody} text-xs w-full mt-2 p-2 rounded border ${borderDefault} ${bgSurface} ${textSecondary} resize-none`}
            rows={8}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        </div>
      </div>

      {/* Fixed bottom section with Add to Queue Button */}
      <div className="flex-shrink-0 p-4 pt-0 space-y-2">
        {/* Result limit input */}
        <div className="flex items-center justify-center gap-2">
          <label className={`text-xs ${textMuted}`}>Limit results to</label>
          <input
            type="number"
            min={100}
            max={100000}
            step={1000}
            value={limitOverride}
            onChange={handleLimitChange}
            disabled={disabled || isRunning}
            className={`${inputBase} w-24 text-xs text-center disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          <span className={`text-xs ${textMuted}`}>rows</span>
        </div>

        <button
          onClick={handleAddToQueue}
          disabled={disabled || isRunning}
          className={`${primaryButtonBase} w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRunning ? (
            <>
              <Loader2 className={`${iconSm} animate-spin`} />
              Processing Queue...
            </>
          ) : (
            <>
              <ListPlus className={iconSm} />
              Add to Queue
            </>
          )}
        </button>

        {/* No profile selected message */}
        {disabled && (
          <p className={`text-xs ${textSecondary} text-center`}>
            Select a PostgreSQL profile to run queries
          </p>
        )}
      </div>
    </div>
  );
}
