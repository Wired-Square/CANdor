// ui/src/apps/catalog/views/ModbusConfigView.tsx

import { Network, Pencil } from "lucide-react";
import type { TomlNode } from "../types";

export type ModbusConfigViewProps = {
  selectedNode: TomlNode;
  onEditConfig?: () => void;
};

export default function ModbusConfigView({
  selectedNode,
  onEditConfig,
}: ModbusConfigViewProps) {
  const deviceAddress = selectedNode.metadata?.deviceAddress;
  const registerBase = selectedNode.metadata?.registerBase;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Network className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              Modbus Configuration
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Protocol-level settings for all Modbus frames
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
            Device Address
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {deviceAddress !== undefined ? (
              deviceAddress
            ) : (
              <span className="text-orange-500">Not set</span>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Register Base
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {registerBase !== undefined ? (
              registerBase === 0 ? "0-based" : "1-based"
            ) : (
              <span className="text-orange-500">Not set</span>
            )}
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">
          <strong>Note:</strong> Individual Modbus frames inherit these settings.
          To change the configuration, click the edit button above.
        </p>
      </div>
    </div>
  );
}
