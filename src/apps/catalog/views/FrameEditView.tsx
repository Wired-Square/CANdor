// ui/src/apps/catalog/views/FrameEditView.tsx
// Generic frame editor that handles CAN, Modbus, and Serial protocols

import { useMemo, useCallback } from "react";
import { Network, Server, Cable } from "lucide-react";
import type {
  ProtocolType,
  ProtocolConfig,
  CANConfig,
  ModbusConfig,
  SerialConfig,
  BaseFrameFields,
} from "../types";
import { protocolRegistry } from "../protocols";
import { CANConfigSection, ModbusConfigSection, SerialConfigSection } from "./protocol-editors";

// Icon mapping for protocols
const protocolIcons: Record<ProtocolType, React.ComponentType<{ className?: string }>> = {
  can: Network,
  modbus: Server,
  serial: Cable,
};

export interface FrameEditFields {
  protocol: ProtocolType;
  config: ProtocolConfig;
  base: BaseFrameFields;
  // For Modbus, we need a separate key since it's not derived from config
  modbusFrameKey?: string;
  // Inheritance flags
  isLengthInherited?: boolean;
  isTransmitterInherited?: boolean;
  isIntervalInherited?: boolean;
  isDeviceAddressInherited?: boolean;
}

export type FrameEditViewProps = {
  title?: string;
  subtitle?: string;

  fields: FrameEditFields;
  setFields: (fields: FrameEditFields) => void;

  availablePeers: string[];

  /** Whether to allow changing the protocol (only for new frames) */
  allowProtocolChange?: boolean;

  /** Default values from catalog meta */
  defaults?: {
    interval?: number;
    modbusDeviceAddress?: number;
    modbusRegisterBase?: 0 | 1;
    serialEncoding?: "slip" | "cobs" | "raw" | "length_prefixed";
  };

  primaryActionLabel?: string;
  onCancel: () => void;
  onSave: () => void;

  disableSave?: boolean;
};

export default function FrameEditView({
  title = "Add New Frame",
  subtitle = "Create a new frame definition",
  fields,
  setFields,
  availablePeers,
  allowProtocolChange = true,
  defaults,
  primaryActionLabel = "Add Frame",
  onCancel,
  onSave,
  disableSave,
}: FrameEditViewProps) {
  // Get registered protocols
  const protocols = useMemo(() => protocolRegistry.all(), []);

  // Handle protocol change
  const handleProtocolChange = useCallback(
    (newProtocol: ProtocolType) => {
      const handler = protocolRegistry.get(newProtocol);
      if (!handler) return;

      const config = handler.getDefaultConfig();
      // NOTE: For serial, encoding is NOT in config - it's catalog-level in [frame.serial.config]

      setFields({
        ...fields,
        protocol: newProtocol,
        config,
        modbusFrameKey: newProtocol === "modbus" ? "" : undefined,
      });
    },
    [fields, setFields]
  );

  // Protocol-specific config updates
  const handleCANConfigChange = useCallback(
    (config: CANConfig) => {
      setFields({ ...fields, config });
    },
    [fields, setFields]
  );

  const handleModbusConfigChange = useCallback(
    (config: ModbusConfig) => {
      setFields({ ...fields, config });
    },
    [fields, setFields]
  );

  const handleModbusKeyChange = useCallback(
    (key: string) => {
      setFields({ ...fields, modbusFrameKey: key });
    },
    [fields, setFields]
  );

  const handleSerialConfigChange = useCallback(
    (config: SerialConfig) => {
      setFields({ ...fields, config });
    },
    [fields, setFields]
  );

  // Base fields updates
  const handleBaseChange = useCallback(
    (updates: Partial<BaseFrameFields>) => {
      setFields({
        ...fields,
        base: { ...fields.base, ...updates },
      });
    },
    [fields, setFields]
  );

  // Inheritance flag updates
  const handleInheritanceChange = useCallback(
    (flag: keyof Pick<FrameEditFields, "isLengthInherited" | "isTransmitterInherited" | "isIntervalInherited" | "isDeviceAddressInherited">, value: boolean) => {
      setFields({ ...fields, [flag]: value });
    },
    [fields, setFields]
  );

  // Render protocol-specific config section
  const renderProtocolConfig = () => {
    switch (fields.protocol) {
      case "can":
        return (
          <CANConfigSection
            config={fields.config as CANConfig}
            onChange={handleCANConfigChange}
          />
        );
      case "modbus":
        return (
          <ModbusConfigSection
            config={fields.config as ModbusConfig}
            onChange={handleModbusConfigChange}
            frameKey={fields.modbusFrameKey ?? ""}
            onFrameKeyChange={handleModbusKeyChange}
            isDeviceAddressInherited={fields.isDeviceAddressInherited}
            onDeviceAddressInheritedChange={(v) => handleInheritanceChange("isDeviceAddressInherited", v)}
            defaultDeviceAddress={defaults?.modbusDeviceAddress}
            defaultRegisterBase={defaults?.modbusRegisterBase}
          />
        );
      case "serial":
        return (
          <SerialConfigSection
            config={fields.config as SerialConfig}
            onChange={handleSerialConfigChange}
            catalogEncoding={defaults?.serialEncoding}
          />
        );
      default:
        return null;
    }
  };

  // Get current handler for display info
  const currentHandler = protocolRegistry.get(fields.protocol);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="space-y-6">
        {/* Protocol Selector (only for new frames) */}
        {allowProtocolChange && (
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-3">
              Protocol
            </label>
            <div className="grid grid-cols-3 gap-3">
              {protocols.map((handler) => {
                const Icon = protocolIcons[handler.type];
                const isSelected = fields.protocol === handler.type;
                return (
                  <button
                    key={handler.type}
                    type="button"
                    onClick={() => handleProtocolChange(handler.type)}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${
                        isSelected ? "text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400"
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {handler.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Protocol-Specific Configuration */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            {currentHandler && (
              <>
                {(() => {
                  const Icon = protocolIcons[currentHandler.type];
                  return <Icon className="w-4 h-4" />;
                })()}
                {currentHandler.displayName} Configuration
              </>
            )}
          </h3>
          {renderProtocolConfig()}
        </div>

        {/* Common Frame Fields */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            Common Properties
          </h3>

          <div className="space-y-4">
            {/* Length (DLC) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Length {fields.protocol === "can" && "(DLC)"}{" "}
                {fields.protocol === "modbus" && "(Registers)"}
              </label>
              <input
                type="number"
                min="0"
                max={fields.protocol === "can" ? 64 : 256}
                value={fields.base.length}
                onChange={(e) => handleBaseChange({ length: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Transmitter (Peer) */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Transmitter (Peer)
              </label>
              <select
                value={fields.base.transmitter || ""}
                onChange={(e) => handleBaseChange({ transmitter: e.target.value || undefined })}
                className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {availablePeers.map((peer) => (
                  <option key={peer} value={peer}>
                    {peer}
                  </option>
                ))}
              </select>
            </div>

            {/* Interval (ms) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-900 dark:text-white">
                  Interval (ms)
                </label>
                {defaults?.interval !== undefined && (
                  <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={fields.isIntervalInherited ?? false}
                      onChange={(e) => handleInheritanceChange("isIntervalInherited", e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                    />
                    Use default ({defaults.interval})
                  </label>
                )}
              </div>
              <input
                type="number"
                min="0"
                value={fields.base.interval ?? ""}
                onChange={(e) =>
                  handleBaseChange({
                    interval: e.target.value ? parseInt(e.target.value) : undefined,
                  })
                }
                disabled={fields.isIntervalInherited}
                className={`w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  fields.isIntervalInherited ? "opacity-50 cursor-not-allowed" : ""
                }`}
                placeholder="1000"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
                Notes
              </label>
              <textarea
                rows={3}
                value={
                  Array.isArray(fields.base.notes)
                    ? fields.base.notes.join("\n")
                    : fields.base.notes || ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) {
                    handleBaseChange({ notes: undefined });
                  } else {
                    const lines = value.split("\n");
                    handleBaseChange({
                      notes: lines.length === 1 ? lines[0] : lines,
                    });
                  }
                }}
                className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Add notes about this frame (one per line)"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={disableSave}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
