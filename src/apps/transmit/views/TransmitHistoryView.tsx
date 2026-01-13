// ui/src/apps/transmit/views/TransmitHistoryView.tsx
//
// Transmitted packet history view.

import { useCallback, useMemo } from "react";
import { Trash2, Check, X, Download } from "lucide-react";
import { useTransmitStore, GVRET_BUSES } from "../../../stores/transmitStore";
import { useSettings } from "../../../hooks/useSettings";
import {
  bgDarkToolbar,
  borderDarkView,
  textDarkMuted,
  hoverDarkRow,
} from "../../../styles/colourTokens";
import { buttonBase } from "../../../styles/buttonStyles";
import { byteToHex } from "../../../utils/byteUtils";
import { formatDisplayTime } from "../../../utils/timeFormat";

export default function TransmitHistoryView() {
  const { settings } = useSettings();

  // Store selectors
  const history = useTransmitStore((s) => s.history);

  // Store actions
  const clearHistory = useTransmitStore((s) => s.clearHistory);

  // Get timestamp format from settings
  const timestampFormat = settings?.display_time_format ?? "human";

  // Handle clear history
  const handleClearHistory = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  // Format timestamp based on settings
  const formatTimestamp = useCallback(
    (timestampUs: number) => {
      // Convert microseconds to seconds
      const timestampSeconds = timestampUs / 1_000_000;

      switch (timestampFormat) {
        case "timestamp":
          // Show epoch seconds with milliseconds
          return `${timestampSeconds.toFixed(3)}`;
        case "delta-start":
        case "delta-last":
          // For delta formats, just show the raw timestamp since we don't track start/last
          return `${timestampSeconds.toFixed(3)}s`;
        case "human":
        default:
          // Use formatDisplayTime which handles human-readable format
          return formatDisplayTime(timestampSeconds);
      }
    },
    [timestampFormat]
  );

  // Format frame for display
  const formatHistoryItem = (item: (typeof history)[0]) => {
    if (item.type === "can" && item.frame) {
      const frame = item.frame;
      const idStr = frame.is_extended
        ? `0x${frame.frame_id.toString(16).toUpperCase().padStart(8, "0")}`
        : `0x${frame.frame_id.toString(16).toUpperCase().padStart(3, "0")}`;
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

    const lines = [
      "Timestamp,Interface,Type,ID,DLC,Data,Flags,Success,Error",
    ];

    for (const item of history) {
      const formatted = formatHistoryItem(item);
      if (!formatted) continue;

      const timestamp = formatTimestamp(item.timestamp_us);
      const id = formatted.id ?? "";
      const dlc = item.frame?.data.length ?? item.bytes?.length ?? 0;
      const data =
        item.frame?.data.map(byteToHex).join("") ??
        item.bytes?.map(byteToHex).join("") ??
        "";
      const flags = formatted.flags.join("|");
      const success = item.success ? "true" : "false";
      const error = item.error ?? "";

      lines.push(
        `"${timestamp}","${item.profileName}","${formatted.type}","${id}",${dlc},"${data}","${flags}",${success},"${error}"`
      );
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transmit-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history, formatTimestamp]);

  // Stats
  const stats = useMemo(() => {
    const total = history.length;
    const success = history.filter((h) => h.success).length;
    const failed = total - success;
    return { total, success, failed };
  }, [history]);

  // Empty state
  if (history.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <div className={`${textDarkMuted} text-center`}>
          <p className="text-lg font-medium">No History</p>
          <p className="text-sm mt-2">
            Transmitted packets will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className={`flex items-center gap-3 px-4 py-2 ${bgDarkToolbar} border-b ${borderDarkView}`}
      >
        <span className={`${textDarkMuted} text-sm`}>
          {stats.total} packet{stats.total !== 1 ? "s" : ""}
          {stats.failed > 0 && (
            <span className="text-red-400 ml-2">
              ({stats.failed} failed)
            </span>
          )}
        </span>

        <div className="flex-1" />

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
            className={`${bgDarkToolbar} sticky top-0 ${textDarkMuted} text-xs`}
          >
            <tr>
              <th className="text-left px-4 py-2 w-12"></th>
              <th className="text-left px-4 py-2">Timestamp</th>
              <th className="text-left px-4 py-2">Interface</th>
              <th className="text-left px-4 py-2 w-16">Type</th>
              <th className="text-left px-4 py-2">Frame / Data</th>
              <th className="text-left px-4 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => {
              const formatted = formatHistoryItem(item);
              if (!formatted) return null;

              return (
                <tr
                  key={item.id}
                  className={`border-b ${borderDarkView} ${hoverDarkRow}`}
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
                    <code className="font-mono text-gray-400 text-xs">
                      {formatTimestamp(item.timestamp_us)}
                    </code>
                  </td>

                  {/* Interface */}
                  <td className="px-4 py-2">
                    <span className="text-gray-300">{item.profileName}</span>
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
                    <div className="flex items-center gap-2">
                      {formatted.id && (
                        <code className="font-mono text-green-400">
                          {formatted.id}
                        </code>
                      )}
                      {formatted.bus !== null && formatted.bus !== undefined && (
                        <span className="text-xs text-amber-400">
                          {GVRET_BUSES.find((b) => b.value === formatted.bus)
                            ?.label ?? `Bus ${formatted.bus}`}
                        </span>
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
    </div>
  );
}
