// src/apps/query/views/QueryBuilderPanel.tsx
//
// Query configuration panel. Users select query type, frame ID, byte index,
// and context window settings.

import { useCallback, useState, useEffect } from "react";
import { Play, Loader2 } from "lucide-react";
import {
  useQueryStore,
  QUERY_TYPE_INFO,
  CONTEXT_PRESETS,
  type QueryType,
} from "../stores/queryStore";
import { queryByteChanges, queryFrameChanges } from "../../../api/dbquery";
import { primaryButtonBase, buttonBase } from "../../../styles/buttonStyles";
import { inputBase } from "../../../styles/inputStyles";
import { labelSmallMuted } from "../../../styles/typography";
import { iconSm, flexRowGap2 } from "../../../styles/spacing";
import { bgSurface, borderDefault, textPrimary, textSecondary } from "../../../styles/colourTokens";

interface Props {
  profileId: string | null;
  disabled?: boolean;
}

export default function QueryBuilderPanel({ profileId, disabled = false }: Props) {
  // Store selectors
  const queryType = useQueryStore((s) => s.queryType);
  const queryParams = useQueryStore((s) => s.queryParams);
  const contextWindow = useQueryStore((s) => s.contextWindow);
  const isRunning = useQueryStore((s) => s.isRunning);

  // Store actions
  const setQueryType = useQueryStore((s) => s.setQueryType);
  const updateQueryParams = useQueryStore((s) => s.updateQueryParams);
  const setContextWindow = useQueryStore((s) => s.setContextWindow);
  const setIsRunning = useQueryStore((s) => s.setIsRunning);
  const setResults = useQueryStore((s) => s.setResults);
  const setError = useQueryStore((s) => s.setError);

  // Local state for frame ID input (allows free typing)
  const [frameIdText, setFrameIdText] = useState(
    `0x${queryParams.frameId.toString(16).toUpperCase()}`
  );

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

  // Run query handler
  const handleRunQuery = useCallback(async () => {
    if (!profileId || isRunning) return;

    setIsRunning(true);
    setError(null);

    try {
      let results: import("../../../api/dbquery").ByteChangeResult[] | import("../../../api/dbquery").FrameChangeResult[];
      let stats: import("../stores/queryStore").QueryStats | undefined;

      switch (queryType) {
        case "byte_changes": {
          const response = await queryByteChanges(
            profileId,
            queryParams.frameId,
            queryParams.byteIndex,
            queryParams.isExtended
          );
          results = response.results;
          stats = response.stats;
          break;
        }

        case "frame_changes": {
          const response = await queryFrameChanges(
            profileId,
            queryParams.frameId,
            queryParams.isExtended
          );
          results = response.results;
          stats = response.stats;
          break;
        }

        default:
          // Other query types not yet implemented
          results = [];
          break;
      }

      setResults(results, stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profileId, isRunning, queryType, queryParams, setIsRunning, setResults, setError]);

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

  const queryInfo = QUERY_TYPE_INFO[queryType];
  const showByteIndex = queryType === "byte_changes";

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
            className={`${inputBase} w-full mt-1`}
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
              className={`${inputBase} flex-1`}
            />
            <label className={`${flexRowGap2} ${textSecondary} text-xs`}>
              <input
                type="checkbox"
                checked={queryParams.isExtended}
                onChange={handleExtendedChange}
                disabled={disabled || isRunning}
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
              className={`${inputBase} w-full mt-1`}
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
                className={`${buttonBase} text-xs px-2 py-1 ${
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
                className={`${inputBase} w-full mt-1 text-xs`}
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
                className={`${inputBase} w-full mt-1 text-xs`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom section with Run Button */}
      <div className="flex-shrink-0 p-4 pt-0 space-y-2">
        <button
          onClick={handleRunQuery}
          disabled={disabled || isRunning}
          className={`${primaryButtonBase} w-full justify-center`}
        >
          {isRunning ? (
            <>
              <Loader2 className={`${iconSm} animate-spin`} />
              Running...
            </>
          ) : (
            <>
              <Play className={iconSm} />
              Run Query
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
