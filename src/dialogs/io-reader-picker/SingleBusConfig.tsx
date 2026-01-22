// ui/src/dialogs/io-reader-picker/SingleBusConfig.tsx
//
// Status and bus configuration UI for single-bus devices (slcan, gs_usb, socketcan, serial).
// Shows device status (online/offline) and allows setting a bus number override.

import { Loader2, AlertCircle, CheckCircle2, Bus } from "lucide-react";
import type { DeviceProbeResult } from "../../api/io";

interface SingleBusConfigProps {
  /** Probe result (null while loading or before probe) */
  probeResult: DeviceProbeResult | null;
  /** Whether probe is in progress */
  isLoading: boolean;
  /** Error message from probe (null if success) */
  error: string | null;
  /** Current bus number override (undefined = use default 0) */
  busOverride?: number;
  /** Called when bus override changes */
  onBusOverrideChange: (bus: number | undefined) => void;
  /** Profile name for display */
  profileName?: string;
  /** Use compact inline styling (no header, reduced padding) */
  compact?: boolean;
  /** Bus numbers that are already used by other sources (for duplicate warning) */
  usedBuses?: Set<number>;
}

export default function SingleBusConfig({
  probeResult,
  isLoading,
  error,
  busOverride,
  onBusOverrideChange,
  profileName,
  compact = false,
  usedBuses,
}: SingleBusConfigProps) {
  const effectiveBus = busOverride ?? 0;
  const isDuplicate = usedBuses && usedBuses.has(effectiveBus);

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

  // Error state (probe failed)
  if (error || (probeResult && !probeResult.success)) {
    const errorMsg = error || probeResult?.error || "Device not responding";
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{errorMsg}</span>
        </div>
      </div>
    );
  }

  // No result yet - show loading (probe should start shortly)
  if (!probeResult) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Probing{profileName ? ` ${profileName}` : ""}...</span>
        </div>
      </div>
    );
  }

  // Success state - show status and bus selector
  if (compact) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
          <span className="text-slate-600 dark:text-slate-400">
            {probeResult.primaryInfo || "Online"}
          </span>
          {probeResult.secondaryInfo && (
            <span className="text-slate-400 dark:text-slate-500">
              ({probeResult.secondaryInfo})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs">
          <Bus className="w-3 h-3 text-slate-400 flex-shrink-0" />
          <span className="text-slate-500 dark:text-slate-400">Bus:</span>
          <select
            value={effectiveBus}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              onBusOverrideChange(val === 0 ? undefined : val);
            }}
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
      </div>
    );
  }

  // Full mode - separate section display
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {probeResult.primaryInfo || "Device Online"}
          </span>
          {probeResult.secondaryInfo && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({probeResult.secondaryInfo})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2 text-sm">
        <Bus className="w-4 h-4 text-slate-400" />
        <span className="text-slate-600 dark:text-slate-400">Output Bus:</span>
        <select
          value={effectiveBus}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            onBusOverrideChange(val === 0 ? undefined : val);
          }}
          className={`px-2 py-1 rounded border text-sm ${
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
          <span className="text-amber-500 text-sm" title="Another source uses this bus number">
            ⚠ Duplicate
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Frames from this device will be tagged with the selected bus number.
      </p>
    </div>
  );
}
