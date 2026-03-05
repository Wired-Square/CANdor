// ui/src/apps/transmit/views/TransmitHistoryView.tsx
//
// Transmitted packet history view.

import React, { useCallback, useMemo } from "react";
import { Trash2, Check, X, Download, StopCircle, Play } from "lucide-react";
import { useTransmitStore } from "../../../stores/transmitStore";
import type { BusSourceInfo } from "../../../stores/sessionStore";
import { useSettings } from "../../../hooks/useSettings";
import {
  bgDataToolbar,
  borderDataView,
  textDataSecondary,
  hoverDataRow,
} from "../../../styles/colourTokens";
import { flexRowGap2 } from "../../../styles/spacing";
import { buttonBase } from "../../../styles/buttonStyles";
import { emptyStateContainer, emptyStateText, emptyStateHeading, emptyStateDescription } from "../../../styles/typography";
import { byteToHex } from "../../../utils/byteUtils";
import { buildCsv } from "../../../utils/csvBuilder";
import { formatFrameId } from "../../../utils/frameIds";
import { formatIsoUs, formatHumanUs, renderDeltaNode } from "../../../utils/timeFormat";
import { formatBusLabel } from "../../../utils/busFormat";

interface TransmitHistoryViewProps {
  outputBusToSource: Map<number, BusSourceInfo>;
}

export default function TransmitHistoryView({ outputBusToSource }: TransmitHistoryViewProps) {
  const { settings } = useSettings();

  // Store selectors
  const history = useTransmitStore((s) => s.history);
  const activeReplays = useTransmitStore((s) => s.activeReplays);
  const replayProgress = useTransmitStore((s) => s.replayProgress);

  // Store actions
  const clearHistory = useTransmitStore((s) => s.clearHistory);
  const stopReplay = useTransmitStore((s) => s.stopReplay);

  // Get timestamp format from settings
  const timestampFormat = settings?.display_time_format ?? "human";

  // Handle clear history
  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  // Get the oldest timestamp for delta-start (history is newest-first, so last item is oldest)
  const oldestTimestampUs = useMemo(() => {
    if (history.length === 0) return null;
    return history[history.length - 1].timestamp_us;
  }, [history]);

  // Format timestamp based on settings - returns React node for delta modes
  const formatTimestamp = useCallback(
    (timestampUs: number, prevTimestampUs: number | null): React.ReactNode => {
      switch (timestampFormat) {
        case "timestamp":
          return formatIsoUs(timestampUs);
        case "delta-start":
          if (oldestTimestampUs === null) return "0.000000s";
          return renderDeltaNode(timestampUs - oldestTimestampUs);
        case "delta-last":
          if (prevTimestampUs === null) return "0.000000s";
          return renderDeltaNode(timestampUs - prevTimestampUs);
        case "human":
        default:
          return formatHumanUs(timestampUs);
      }
    },
    [timestampFormat, oldestTimestampUs]
  );

  // Format timestamp as string for CSV export
  const formatTimestampString = useCallback(
    (timestampUs: number): string => {
      switch (timestampFormat) {
        case "timestamp":
          return formatIsoUs(timestampUs);
        case "delta-start":
        case "delta-last":
          // For CSV, just use seconds
          return `${(timestampUs / 1_000_000).toFixed(6)}`;
        case "human":
        default:
          return formatHumanUs(timestampUs);
      }
    },
    [timestampFormat]
  );

  // Format frame for display
  const formatHistoryItem = (item: (typeof history)[0]) => {
    if (item.type === "can" && item.frame) {
      const frame = item.frame;
      const idStr = formatFrameId(frame.frame_id, "hex", frame.is_extended);
      const dataStr = frame.data.map(byteToHex).join(" ");
      return {
        type: "CAN",
        id: idStr,
        details: `[${frame.data.length}] ${dataStr}`,
        flags: [
          frame.is_extended && "EXT",
          frame.is_fd && "FD",
          frame.is_brs && "BRS",
          frame.is_rtr && "RTR",
        ].filter((f): f is string => Boolean(f)),
        bus: frame.bus,
      };
    } else if (item.type === "serial" && item.bytes) {
      const dataStr = item.bytes.slice(0, 8).map(byteToHex).join(" ");
      const truncated = item.bytes.length > 8 ? "..." : "";
      return {
        type: "Serial",
        id: null,
        details: `[${item.bytes.length}] ${dataStr}${truncated}`,
        flags: [],
        bus: null,
      };
    }
    return null;
  };

  // Export history as CSV
  const handleExport = useCallback(() => {
    if (history.length === 0) return;

    const headers = ["Timestamp", "Interface", "Type", "ID", "DLC", "Data", "Flags", "Success", "Error"];
    const rows: (string | number)[][] = [];

    for (const item of history) {
      const formatted = formatHistoryItem(item);
      if (!formatted) continue;

      rows.push([
        formatTimestampString(item.timestamp_us),
        item.profileName,
        formatted.type,
        formatted.id ?? "",
        item.frame?.data.length ?? item.bytes?.length ?? 0,
        item.frame?.data.map(byteToHex).join("") ?? item.bytes?.map(byteToHex).join("") ?? "",
        formatted.flags.join("|"),
        item.success ? "true" : "false",
        item.error ?? "",
      ]);
    }

    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transmit-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history, formatTimestampString]);

  // Stats
  const stats = useMemo(() => {
    const total = history.length;
    const success = history.filter((h) => h.success).length;
    const failed = total - success;
    return { total, success, failed };
  }, [history]);

  return (
    <div className="flex flex-col h-full">
      {/* Active replay banners */}
      {replayProgress.size > 0 && (
        <div className={`border-b ${borderDataView}`}>
          {[...replayProgress.entries()].map(([replayId, info]) => {
            const pct = info.totalFrames > 0
              ? Math.round((info.framesSent / info.totalFrames) * 100)
              : 0;
            return (
              <div
                key={replayId}
                className={`flex items-center gap-3 px-4 py-2 ${bgDataToolbar}`}
              >
                <Play size={12} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${textDataSecondary}`}>
                      Replaying{info.loopReplay ? " (loop)" : ""}
                      <span className="ml-1.5 font-mono">
                        {info.framesSent} / {info.totalFrames}
                      </span>
                      <span className="ml-1.5 text-[color:var(--text-secondary)]">
                        {info.speed}×
                      </span>
                    </span>
                    <span className={`text-xs font-mono ${textDataSecondary}`}>{pct}%</span>
                  </div>
                  <div className={`h-1 rounded-full bg-[var(--bg-surface)] overflow-hidden`}>
                    <div
                      className="h-full bg-blue-500 transition-all duration-200"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <button
                  onClick={() => stopReplay(replayId)}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-red-500/40 bg-red-600/15 text-red-400 hover:bg-red-600/25 transition-colors"
                  title="Stop this replay"
                >
                  <StopCircle size={11} />
                  Stop
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state (no history yet) */}
      {history.length === 0 && (
        <div className={emptyStateContainer}>
          <div className={emptyStateText}>
            <p className={emptyStateHeading}>No History</p>
            <p className={emptyStateDescription}>
              Transmitted packets will appear here.
            </p>
          </div>
        </div>
      )}

      {history.length === 0 ? null : (<>
      {/* Toolbar */}
      <div
        className={`flex items-center gap-3 px-4 py-2 ${bgDataToolbar} border-b ${borderDataView}`}
      >
        <span className={`${textDataSecondary} text-sm`}>
          {stats.total} packet{stats.total !== 1 ? "s" : ""}
          {stats.failed > 0 && (
            <span className="text-red-400 ml-2">
              ({stats.failed} failed)
            </span>
          )}
        </span>

        <div className="flex-1" />

        {/* Stop active replays */}
        {activeReplays.size > 0 && (
          <button
            onClick={() => activeReplays.forEach((id) => stopReplay(id))}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-red-500/50 bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            title="Stop all active replays"
          >
            <StopCircle size={13} />
            Stop Replay{activeReplays.size > 1 ? `s (${activeReplays.size})` : ""}
          </button>
        )}

        <button
          onClick={handleExport}
          className={buttonBase}
          title="Export as CSV"
        >
          <Download size={14} />
          <span className="text-sm ml-1">Export</span>
        </button>

        <button
          onClick={handleClearHistory}
          className={buttonBase}
          title="Clear history"
        >
          <Trash2 size={14} />
          <span className="text-sm ml-1">Clear</span>
        </button>
      </div>

      {/* History Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead
            className={`${bgDataToolbar} sticky top-0 ${textDataSecondary} text-xs`}
          >
            <tr>
              <th className="text-left px-4 py-2 w-12"></th>
              <th className="text-left px-4 py-2">Timestamp</th>
              <th className="text-left px-4 py-2">Bus</th>
              <th className="text-left px-4 py-2 w-16">Type</th>
              <th className="text-left px-4 py-2">Frame / Data</th>
              <th className="text-left px-4 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item, index) => {
              // Get previous timestamp for delta-last (history is newest-first)
              // So the "previous" in chronological order is the next item in the array
              const prevTimestampUs = index < history.length - 1
                ? history[index + 1].timestamp_us
                : null;

              // Replay row (started or summary)
              if (item.type === "replay") {
                const framesSent = item.replayFramesSent ?? 0;
                const totalFrames = item.replayTotalFrames ?? 0;
                const speed = item.replaySpeed ?? 1;
                const isLoop = item.replayLoopReplay ?? false;

                let frameInfo: string;
                if (item.replayStarted) {
                  frameInfo = isLoop
                    ? `${totalFrames} frames/pass · ${speed}× · Loop`
                    : `${totalFrames} frames · ${speed}×`;
                } else if (isLoop) {
                  frameInfo = `${framesSent} frames · ${speed}× · Loop`;
                } else if (item.success) {
                  frameInfo = `${totalFrames} frames · ${speed}×`;
                } else {
                  frameInfo = `${framesSent} / ${totalFrames} frames · ${speed}×`;
                }

                return (
                  <tr key={item.id} className={`border-b ${borderDataView} ${hoverDataRow}`}>
                    <td className="px-4 py-2">
                      {item.replayStarted ? (
                        <Play size={14} className="text-teal-400" />
                      ) : item.success ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <X size={14} className="text-red-400" />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-gray-400 text-xs">
                        {formatTimestamp(item.timestamp_us, prevTimestampUs)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`${textDataSecondary} text-xs truncate max-w-[120px] block`}>
                        {item.profileName}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-teal-600/30 text-teal-400">
                        Replay
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-gray-400 text-xs">{frameInfo}</span>
                    </td>
                    <td className="px-4 py-2">
                      {item.error && <span className="text-red-400 text-xs">{item.error}</span>}
                    </td>
                  </tr>
                );
              }

              const formatted = formatHistoryItem(item);
              if (!formatted) return null;

              return (
                <tr
                  key={item.id}
                  className={`border-b ${borderDataView} ${hoverDataRow}`}
                >
                  {/* Status */}
                  <td className="px-4 py-2">
                    {item.success ? (
                      <Check size={14} className="text-green-400" />
                    ) : (
                      <X size={14} className="text-red-400" />
                    )}
                  </td>

                  {/* Timestamp */}
                  <td className="px-4 py-2">
                    <span className="font-mono text-gray-400 text-xs">
                      {formatTimestamp(item.timestamp_us, prevTimestampUs)}
                    </span>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-2">
                    <span
                      className={`${textDataSecondary} text-xs truncate max-w-[120px] block`}
                      title={formatBusLabel(item.profileName, formatted.bus, outputBusToSource)}
                    >
                      {formatBusLabel(item.profileName, formatted.bus, outputBusToSource)}
                    </span>
                  </td>

                  {/* Type */}
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        formatted.type === "CAN"
                          ? "bg-blue-600/30 text-blue-400"
                          : "bg-purple-600/30 text-purple-400"
                      }`}
                    >
                      {formatted.type}
                    </span>
                  </td>

                  {/* Frame / Data */}
                  <td className="px-4 py-2">
                    <div className={flexRowGap2}>
                      {formatted.id && (
                        <code className="font-mono text-green-400">
                          {formatted.id}
                        </code>
                      )}
                      <code className="font-mono text-gray-400 text-xs">
                        {formatted.details}
                      </code>
                      {formatted.flags.map((flag) => (
                        <span
                          key={flag}
                          className="text-[10px] text-amber-400 uppercase"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Error */}
                  <td className="px-4 py-2">
                    {item.error && (
                      <span className="text-red-400 text-xs">{item.error}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>)}
    </div>
  );
}
