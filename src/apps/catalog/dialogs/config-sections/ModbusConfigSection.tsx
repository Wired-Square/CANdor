// ui/src/apps/catalog/dialogs/config-sections/ModbusConfigSection.tsx
// Modbus protocol configuration section for unified config dialog

import { Network, ChevronDown, ChevronRight, AlertTriangle, Check } from "lucide-react";

export type ModbusConfigSectionProps = {
  isConfigured: boolean;
  hasFrames: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAdd: () => void;
  onRemove: () => void;
  // Config values (only used when configured)
  deviceAddress: number;
  setDeviceAddress: (address: number) => void;
  registerBase: 0 | 1;
  setRegisterBase: (base: 0 | 1) => void;
};

export default function ModbusConfigSection({
  isConfigured,
  hasFrames,
  isExpanded,
  onToggleExpanded,
  onAdd,
  onRemove,
  deviceAddress,
  setDeviceAddress,
  registerBase,
  setRegisterBase,
}: ModbusConfigSectionProps) {
  // Status indicator
  const showWarning = hasFrames && !isConfigured;
  const isValid = deviceAddress >= 1 && deviceAddress <= 247;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleExpanded(); }}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded">
            <Network className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="font-medium text-slate-900 dark:text-white">Modbus</span>
          {isConfigured && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="w-3 h-3" />
              configured
            </span>
          )}
          {showWarning && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              frames exist, no config
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isConfigured ? (
            <button
              type="button"
              onClick={onRemove}
              className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && isConfigured && (
        <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
          {/* Device Address */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Device Address <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              max={247}
              value={deviceAddress}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) setDeviceAddress(val);
              }}
              className={`w-full px-4 py-2 border rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !isValid
                  ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
                  : "bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600"
              }`}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Modbus slave address (1-247)
            </p>
          </div>

          {/* Register Base */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Register Base <span className="text-red-500">*</span>
            </label>
            <select
              value={registerBase}
              onChange={(e) => setRegisterBase(parseInt(e.target.value) as 0 | 1)}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>0-based (register 0 = address 0)</option>
              <option value={1}>1-based (register 1 = address 0)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Register addressing convention used by the device
            </p>
          </div>
        </div>
      )}

      {/* Collapsed preview when configured but not expanded */}
      {!isExpanded && isConfigured && (
        <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
          Address: {deviceAddress} • Base: {registerBase}-based
        </div>
      )}
    </div>
  );
}
