// src/apps/query/views/ResultsPanel.tsx
//
// Results display panel. Shows query results in a timeline view with
// click-to-ingest functionality.

import { useCallback } from "react";
import { PlayCircle, Download, AlertCircle, Database } from "lucide-react";
import {
  useQueryStore,
  QUERY_TYPE_INFO,
  type ByteChangeResult,
  type FrameChangeResult,
} from "../stores/queryStore";
import { useSettingsStore } from "../../settings/stores/settingsStore";
import { formatHumanUs } from "../../../utils/timeFormat";
import { iconButtonBase, buttonBase } from "../../../styles/buttonStyles";
import { monoBody } from "../../../styles/typography";
import { iconSm, iconMd, iconXl } from "../../../styles/spacing";
import { borderDivider, hoverBg, textPrimary, textSecondary, textMuted, textDataAmber, textDataGreen, textDataPurple } from "../../../styles/colourTokens";

interface Props {
  onIngestEvent: (timestampUs: number) => Promise<void>;
}

export default function ResultsPanel({ onIngestEvent }: Props) {
  // Store selectors
  const queryType = useQueryStore((s) => s.queryType);
  const results = useQueryStore((s) => s.results);
  const resultCount = useQueryStore((s) => s.resultCount);
  const lastQueryStats = useQueryStore((s) => s.lastQueryStats);
  const isRunning = useQueryStore((s) => s.isRunning);
  const error = useQueryStore((s) => s.error);
  const timezone = useSettingsStore((s) => s.display.timezone);

  const queryInfo = QUERY_TYPE_INFO[queryType];

  // Format timestamp for display (short form: date + time with milliseconds)
  const formatTimestamp = useCallback((timestampUs: number) => {
    const date = new Date(timestampUs / 1000);
    const ms = Math.floor((timestampUs / 1000) % 1000);

    if (timezone === "utc") {
      // UTC format: MM-DD HH:MM:SS.mmm
      const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const day = date.getUTCDate().toString().padStart(2, "0");
      const hours = date.getUTCHours().toString().padStart(2, "0");
      const minutes = date.getUTCMinutes().toString().padStart(2, "0");
      const seconds = date.getUTCSeconds().toString().padStart(2, "0");
      return `${month}-${day} ${hours}:${minutes}:${seconds}.${ms.toString().padStart(3, "0")}`;
    } else {
      // Local format: MM-DD HH:MM:SS.mmm
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const seconds = date.getSeconds().toString().padStart(2, "0");
      return `${month}-${day} ${hours}:${minutes}:${seconds}.${ms.toString().padStart(3, "0")}`;
    }
  }, [timezone]);

  // Format timestamp for hover tooltip (full date/time with microseconds)
  const formatTimestampFull = useCallback((timestampUs: number) => {
    // formatHumanUs gives UTC; for local we need custom formatting
    if (timezone === "utc") {
      return formatHumanUs(timestampUs) + " UTC";
    } else {
      const date = new Date(timestampUs / 1000);
      const usRemainder = timestampUs % 1000;
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const day = date.getDate().toString().padStart(2, "0");
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const seconds = date.getSeconds().toString().padStart(2, "0");
      const ms = date.getMilliseconds().toString().padStart(3, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}${usRemainder.toString().padStart(3, "0")} Local`;
    }
  }, [timezone]);

  // Format byte value
  const formatByte = useCallback((value: number) => {
    return `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
  }, []);

  // Render empty state
  if (!results && !isRunning && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Database className={`${iconXl} ${textMuted} mb-4`} />
        <h3 className={`text-sm font-medium ${textPrimary} mb-2`}>No Results</h3>
        <p className={`text-xs ${textSecondary} max-w-xs`}>
          Configure a query in the panel on the left and click "Run Query" to search the database.
        </p>
      </div>
    );
  }

  // Render loading state
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h3 className={`text-sm font-medium ${textPrimary} mb-2`}>Running Query</h3>
        <p className={`text-xs ${textSecondary}`}>
          Searching for {queryInfo.label.toLowerCase()}...
        </p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertCircle className={`${iconXl} text-red-400 mb-4`} />
        <h3 className={`text-sm font-medium ${textPrimary} mb-2`}>Query Failed</h3>
        <p className={`text-xs text-red-400 max-w-xs`}>{error}</p>
      </div>
    );
  }

  // Render empty results
  if (results && resultCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Database className={`${iconXl} ${textMuted} mb-4`} />
        <h3 className={`text-sm font-medium ${textPrimary} mb-2`}>No Matches Found</h3>
        <p className={`text-xs ${textSecondary} max-w-xs mb-3`}>
          No {queryInfo.label.toLowerCase()} were found matching your criteria.
          Try adjusting the frame ID or time range.
        </p>
        {lastQueryStats && (
          <p className={`text-xs ${textMuted}`}>
            Scanned {lastQueryStats.rows_scanned.toLocaleString()} rows in {lastQueryStats.execution_time_ms}ms
          </p>
        )}
      </div>
    );
  }

  // Render results
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 ${borderDivider}`}>
        <div>
          <h2 className={`text-sm font-semibold ${textPrimary}`}>Results</h2>
          <p className={`text-xs ${textSecondary}`}>
            {resultCount.toLocaleString()} {queryInfo.label.toLowerCase()} found
            {lastQueryStats && (
              <span className={textMuted}>
                {" "}· {lastQueryStats.rows_scanned.toLocaleString()} rows in {lastQueryStats.execution_time_ms}ms
              </span>
            )}
          </p>
        </div>
        <button
          className={iconButtonBase}
          title="Export results to CSV"
          disabled={resultCount === 0}
        >
          <Download className={iconMd} />
        </button>
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-[var(--border-default)]">
          {results &&
            (results as (ByteChangeResult | FrameChangeResult)[]).map((result, index) => (
              <ResultRow
                key={index}
                result={result}
                queryType={queryType}
                formatTimestamp={formatTimestamp}
                formatTimestampFull={formatTimestampFull}
                formatByte={formatByte}
                onIngest={onIngestEvent}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// Individual result row component
interface ResultRowProps {
  result: ByteChangeResult | FrameChangeResult;
  queryType: string;
  formatTimestamp: (us: number) => string;
  formatTimestampFull: (us: number) => string;
  formatByte: (value: number) => string;
  onIngest: (timestampUs: number) => Promise<void>;
}

function ResultRow({
  result,
  queryType,
  formatTimestamp,
  formatTimestampFull,
  formatByte,
  onIngest,
}: ResultRowProps) {
  const handleIngestClick = useCallback(() => {
    onIngest(result.timestamp_us);
  }, [result.timestamp_us, onIngest]);

  // Render byte change result
  if (queryType === "byte_changes") {
    const byteResult = result as ByteChangeResult;
    return (
      <div className={`flex items-center gap-3 px-4 py-2 ${hoverBg} group`}>
        {/* Timestamp */}
        <span
          className={`${monoBody} text-xs ${textDataAmber} w-36 flex-shrink-0`}
          title={formatTimestampFull(byteResult.timestamp_us)}
        >
          {formatTimestamp(byteResult.timestamp_us)}
        </span>

        {/* Value change */}
        <span className={`${monoBody} text-xs flex-1`}>
          <span className={textDataPurple}>{formatByte(byteResult.old_value)}</span>
          <span className={textMuted}> → </span>
          <span className={textDataGreen}>{formatByte(byteResult.new_value)}</span>
        </span>

        {/* Ingest button */}
        <button
          onClick={handleIngestClick}
          className={`${buttonBase} opacity-0 group-hover:opacity-100 transition-opacity`}
          title="Ingest frames around this event"
        >
          <PlayCircle className={iconSm} />
          <span className="text-xs">Ingest</span>
        </button>
      </div>
    );
  }

  // Render frame change result
  const frameResult = result as FrameChangeResult;
  return (
    <div className={`flex items-center gap-3 px-4 py-2 ${hoverBg} group`}>
      {/* Timestamp */}
      <span
        className={`${monoBody} text-xs ${textDataAmber} w-36 flex-shrink-0`}
        title={formatTimestampFull(frameResult.timestamp_us)}
      >
        {formatTimestamp(frameResult.timestamp_us)}
      </span>

      {/* Changed bytes count */}
      <span className={`text-xs ${textSecondary} flex-1`}>
        {frameResult.changed_indices.length} byte(s) changed
      </span>

      {/* Ingest button */}
      <button
        onClick={handleIngestClick}
        className={`${buttonBase} opacity-0 group-hover:opacity-100 transition-opacity`}
        title="Ingest frames around this event"
      >
        <PlayCircle className={iconSm} />
        <span className="text-xs">Ingest</span>
      </button>
    </div>
  );
}
