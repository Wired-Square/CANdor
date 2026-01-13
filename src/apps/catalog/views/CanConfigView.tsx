// ui/src/apps/catalog/views/CanConfigView.tsx

import { Network, Pencil } from "lucide-react";
import type { TomlNode, CanProtocolConfig } from "../types";

export type CanConfigViewProps = {
  selectedNode: TomlNode;
  canConfig?: CanProtocolConfig;
  onEditConfig?: () => void;
};

export default function CanConfigView({
  selectedNode,
  canConfig,
  onEditConfig,
}: CanConfigViewProps) {
  // Get values from canConfig (parsed from TOML) or fallback to node metadata
  const defaultEndianness = canConfig?.default_endianness ?? selectedNode.metadata?.properties?.default_endianness;
  const defaultInterval = canConfig?.default_interval ?? selectedNode.metadata?.properties?.default_interval;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Network className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              CAN Configuration
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Protocol-level settings for all CAN frames
            </p>
          </div>
        </div>
        {onEditConfig && (
          <button
            onClick={onEditConfig}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit configuration"
          >
            <Pencil className="w-4 h-4 text-slate-700 dark:text-slate-200" />
          </button>
        )}
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Default Endianness
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {defaultEndianness ? (
              defaultEndianness === "little" ? "Little Endian" : "Big Endian"
            ) : (
              <span className="text-orange-500">Not set</span>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Default Interval
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {defaultInterval !== undefined ? (
              `${defaultInterval} ms`
            ) : (
              <span className="text-slate-400">Not specified</span>
            )}
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> Individual CAN frames inherit these settings.
          Frames can override the interval but will use the default endianness for signal decoding.
        </p>
      </div>
    </div>
  );
}
