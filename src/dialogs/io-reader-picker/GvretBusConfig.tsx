// ui/src/dialogs/io-reader-picker/GvretBusConfig.tsx
//
// Bus configuration UI for GVRET devices.
// Shows available buses with toggles to enable/disable and optional bus remapping.

import { Loader2, AlertCircle, Bus } from "lucide-react";
import type { GvretDeviceInfo, BusMapping } from "../../api/io";

// Generic bus names - actual meaning varies by device
const BUS_NAMES: Record<number, string> = {
  0: "Bus 0",
  1: "Bus 1",
  2: "Bus 2",
  3: "Bus 3",
  4: "Bus 4",
};

interface GvretBusConfigProps {
  /** Device info from probing (null while loading or on error) */
  deviceInfo: GvretDeviceInfo | null;
  /** Whether probe is in progress */
  isLoading: boolean;
  /** Error message from probe (null if success) */
  error: string | null;
  /** Current bus mapping configuration */
  busConfig: BusMapping[];
  /** Called when bus config changes */
  onBusConfigChange: (config: BusMapping[]) => void;
  /** Profile name for display */
  profileName?: string;
  /** Use compact inline styling (no header, reduced padding) */
  compact?: boolean;
  /** Output bus numbers that are already used by other sources (for duplicate warning) */
  usedOutputBuses?: Set<number>;
}

export default function GvretBusConfig({
  deviceInfo,
  isLoading,
  error,
  busConfig,
  onBusConfigChange,
  profileName,
  compact = false,
  usedOutputBuses,
}: GvretBusConfigProps) {
  // Toggle a bus enabled/disabled
  const toggleBus = (deviceBus: number) => {
    const newConfig = busConfig.map((mapping) =>
      mapping.deviceBus === deviceBus
        ? { ...mapping, enabled: !mapping.enabled }
        : mapping
    );
    onBusConfigChange(newConfig);
  };

  // Change output bus number
  const setOutputBus = (deviceBus: number, outputBus: number) => {
    const newConfig = busConfig.map((mapping) =>
      mapping.deviceBus === deviceBus
        ? { ...mapping, outputBus }
        : mapping
    );
    onBusConfigChange(newConfig);
  };

  // Compact wrapper for inline display
  const wrapperClass = compact
    ? "ml-7 mt-1 mb-2 pl-3 border-l-2 border-cyan-400 dark:border-cyan-600"
    : "border-t border-slate-200 dark:border-slate-700 px-4 py-3";

  // Loading state
  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Probing{profileName ? ` ${profileName}` : ""}...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      </div>
    );
  }

  // No device info yet - show loading state (probe should start shortly)
  if (!deviceInfo) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Probing{profileName ? ` ${profileName}` : ""}...</span>
        </div>
      </div>
    );
  }

  // Count enabled buses
  const enabledCount = busConfig.filter((m) => m.enabled).length;

  // Check for duplicate output buses (used by other sources)
  const hasDuplicates = usedOutputBuses && busConfig.some(
    (m) => m.enabled && usedOutputBuses.has(m.outputBus)
  );

  // Compact mode - inline display below profile button
  if (compact) {
    return (
      <div className="ml-7 mt-1 mb-2 pl-3 border-l-2 border-cyan-400 dark:border-cyan-600">
        <div className="space-y-1">
          {busConfig.map((mapping) => {
            const isDuplicate = usedOutputBuses && mapping.enabled && usedOutputBuses.has(mapping.outputBus);
            return (
              <div
                key={mapping.deviceBus}
                className="flex items-center gap-2 text-xs"
              >
                {/* Enable/disable checkbox */}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mapping.enabled}
                    onChange={() => toggleBus(mapping.deviceBus)}
                    className="w-3 h-3 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 dark:bg-slate-700"
                  />
                  <span className="text-slate-600 dark:text-slate-400">
                    {BUS_NAMES[mapping.deviceBus] || `Bus ${mapping.deviceBus}`}
                  </span>
                </label>

                {/* Output bus selector (only show if enabled) */}
                {mapping.enabled && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 dark:text-slate-500">→</span>
                    <select
                      value={mapping.outputBus}
                      onChange={(e) =>
                        setOutputBus(mapping.deviceBus, parseInt(e.target.value, 10))
                      }
                      className={`px-1 py-0.5 rounded border text-xs ${
                        isDuplicate
                          ? "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                          : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      } focus:ring-1 focus:ring-cyan-500`}
                    >
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i} value={i}>
                          Bus {i}
                        </option>
                      ))}
                    </select>
                    {isDuplicate && (
                      <span className="text-amber-500" title="Another source uses this bus number">⚠</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {hasDuplicates && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
            Duplicate bus numbers may cause confusion
          </p>
        )}
      </div>
    );
  }

  // Full mode - separate section display
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Bus className="w-4 h-4 text-cyan-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wide">
          {profileName ? `${profileName} - ` : ""}CAN Buses ({enabledCount}/{deviceInfo.bus_count} enabled)
        </span>
      </div>

      <div className="space-y-1">
        {busConfig.map((mapping) => {
          const isDuplicate = usedOutputBuses && mapping.enabled && usedOutputBuses.has(mapping.outputBus);
          return (
            <div
              key={mapping.deviceBus}
              className={`flex items-center gap-3 px-2 py-1.5 rounded transition-colors ${
                mapping.enabled
                  ? "bg-slate-50 dark:bg-slate-800/50"
                  : "bg-slate-100/50 dark:bg-slate-900/50 opacity-60"
              }`}
            >
              {/* Enable/disable checkbox */}
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={mapping.enabled}
                  onChange={() => toggleBus(mapping.deviceBus)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-cyan-600 focus:ring-cyan-500 dark:bg-slate-700"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {BUS_NAMES[mapping.deviceBus] || `Bus ${mapping.deviceBus}`}
                </span>
              </label>

              {/* Output bus selector (only show if enabled) */}
              {mapping.enabled && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">→ Output:</span>
                  <select
                    value={mapping.outputBus}
                    onChange={(e) =>
                      setOutputBus(mapping.deviceBus, parseInt(e.target.value, 10))
                    }
                    className={`px-1.5 py-0.5 rounded border text-xs ${
                      isDuplicate
                        ? "border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    } focus:ring-1 focus:ring-cyan-500`}
                  >
                    {Array.from({ length: 8 }, (_, i) => (
                      <option key={i} value={i}>
                        Bus {i}
                      </option>
                    ))}
                  </select>
                  {isDuplicate && (
                    <span className="text-amber-500" title="Another source uses this bus number">⚠</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {enabledCount === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          No buses enabled. Enable at least one bus to capture frames.
        </p>
      )}
      {hasDuplicates && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
          Warning: Some output bus numbers conflict with other sources
        </p>
      )}
    </div>
  );
}
