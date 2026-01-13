// ui/src/apps/catalog/views/ModbusFrameView.tsx

import { Pencil, Trash2 } from "lucide-react";
import type { TomlNode } from "../types";

export type ModbusFrameViewProps = {
  selectedNode: TomlNode;
  onEditFrame?: (node: TomlNode) => void;
  onDeleteFrame?: (key: string) => void;
};

export default function ModbusFrameView({
  selectedNode,
  onEditFrame,
  onDeleteFrame,
}: ModbusFrameViewProps) {
  const registerNumber = selectedNode.metadata?.registerNumber;
  const deviceAddress = selectedNode.metadata?.deviceAddress;
  const deviceAddressInherited = selectedNode.metadata?.deviceAddressInherited;
  const registerType = selectedNode.metadata?.registerType ?? "holding";
  const length = selectedNode.metadata?.length;
  const transmitter = selectedNode.metadata?.transmitter;
  const interval = selectedNode.metadata?.interval;
  const intervalInherited = selectedNode.metadata?.intervalInherited;
  const notes = selectedNode.metadata?.notes;

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">Configure Modbus frame properties</p>
          <div className="text-lg font-bold text-slate-900 dark:text-white">
            {selectedNode.key}
          </div>
        </div>
        {(onEditFrame || onDeleteFrame) && (
          <div className="flex gap-2">
            {onEditFrame && (
              <button
                onClick={() => onEditFrame(selectedNode)}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="Edit frame"
              >
                <Pencil className="w-4 h-4 text-slate-700 dark:text-slate-200" />
              </button>
            )}
            {onDeleteFrame && (
              <button
                onClick={() => onDeleteFrame(selectedNode.key)}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                title="Delete frame"
              >
                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Register Number
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {registerNumber ?? <span className="text-orange-500">Not set</span>}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Device Address
            {deviceAddressInherited && (
              <span className="ml-1 text-blue-500 dark:text-blue-400" title="Inherited from default_modbus_device_address">
                (inherited)
              </span>
            )}
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {deviceAddress ?? <span className="text-orange-500">Not set</span>}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Register Type
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white capitalize">
            {registerType}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Length (Registers)
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {length ?? 1}
          </div>
        </div>

        {transmitter && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Transmitter
            </div>
            <div className="font-mono text-sm text-slate-900 dark:text-white">
              {transmitter}
            </div>
          </div>
        )}

        {interval !== undefined && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Interval
              {intervalInherited && (
                <span className="ml-1 text-blue-500 dark:text-blue-400" title="Inherited from default_interval">
                  (inherited)
                </span>
              )}
            </div>
            <div className="font-mono text-sm text-slate-900 dark:text-white">
              {interval} ms
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {notes && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Notes
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {Array.isArray(notes) ? notes.join("\n") : notes}
          </div>
        </div>
      )}

      {/* Signals info */}
      {selectedNode.children && selectedNode.children.length > 0 && (
        <div className="text-sm text-slate-600 dark:text-slate-400">
          This Modbus frame has {selectedNode.children.length} child node(s). Use the tree to navigate.
        </div>
      )}
    </div>
  );
}
