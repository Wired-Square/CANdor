// ui/src/apps/catalog/views/SerialConfigView.tsx

import { Cable, Pencil } from "lucide-react";
import type { TomlNode } from "../types";

export type SerialConfigViewProps = {
  selectedNode: TomlNode;
  onEditConfig?: () => void;
};

const encodingLabels: Record<string, string> = {
  slip: "SLIP (RFC 1055)",
  cobs: "COBS",
  raw: "Raw (delimiter-based)",
  length_prefixed: "Length Prefixed",
};

export default function SerialConfigView({
  selectedNode,
  onEditConfig,
}: SerialConfigViewProps) {
  const encoding = selectedNode.metadata?.encoding;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Cable className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              Serial Configuration
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Protocol-level settings for all serial frames
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
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg col-span-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Encoding
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {encoding ? (
              <span className="uppercase">{encodingLabels[encoding] || encoding}</span>
            ) : (
              <span className="text-orange-500">Not set</span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            This encoding applies to all serial frames in the catalog.
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> Individual serial frames inherit this encoding.
          To change the encoding, click the edit button above.
        </p>
      </div>
    </div>
  );
}
