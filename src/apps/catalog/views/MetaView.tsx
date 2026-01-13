// ui/src/apps/catalog/views/MetaView.tsx

import { FileText, Pencil, Network, Cable, Check } from "lucide-react";
import type { MetaFields, CanProtocolConfig, SerialProtocolConfig, ModbusProtocolConfig } from "../types";

export type MetaViewProps = {
  metaFields: MetaFields;
  canConfig?: CanProtocolConfig;
  serialConfig?: SerialProtocolConfig;
  modbusConfig?: ModbusProtocolConfig;
  hasCanFrames?: boolean;
  hasSerialFrames?: boolean;
  hasModbusFrames?: boolean;
  onEditMeta: () => void;
};

export default function MetaView({
  metaFields,
  canConfig,
  serialConfig,
  modbusConfig,
  hasCanFrames,
  hasSerialFrames,
  hasModbusFrames,
  onEditMeta,
}: MetaViewProps) {
  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">
              Catalog Metadata
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Name, version, and protocol settings
            </p>
          </div>
        </div>
        <button
          onClick={onEditMeta}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Edit metadata and config"
        >
          <Pencil className="w-4 h-4 text-slate-700 dark:text-slate-200" />
        </button>
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Name <span className="text-red-500">*</span>
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {metaFields.name || <span className="text-red-500">Not set</span>}
          </div>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Version <span className="text-red-500">*</span>
          </div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {metaFields.version}
          </div>
        </div>
      </div>

      {/* Protocol Configurations */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Protocol Configurations
        </h3>

        {/* CAN Config */}
        <ProtocolConfigCard
          icon={<Network className="w-4 h-4 text-green-600 dark:text-green-400" />}
          iconBg="bg-green-100 dark:bg-green-900/30"
          name="CAN"
          isConfigured={!!canConfig}
          hasFrames={hasCanFrames}
        >
          {canConfig && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span>Endianness: {canConfig.default_endianness}</span>
              {canConfig.default_interval !== undefined && (
                <span> • Interval: {canConfig.default_interval}ms</span>
              )}
              {canConfig.frame_id_mask !== undefined && (
                <span> • Mask: 0x{canConfig.frame_id_mask.toString(16).toUpperCase()}</span>
              )}
              {canConfig.fields && Object.keys(canConfig.fields).length > 0 && (
                <span> • {Object.keys(canConfig.fields).length} header field(s)</span>
              )}
            </div>
          )}
        </ProtocolConfigCard>

        {/* Serial Config */}
        <ProtocolConfigCard
          icon={<Cable className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
          iconBg="bg-purple-100 dark:bg-purple-900/30"
          name="Serial"
          isConfigured={!!serialConfig}
          hasFrames={hasSerialFrames}
        >
          {serialConfig && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span>Encoding: {serialConfig.encoding?.toUpperCase()}</span>
              {serialConfig.byte_order && (
                <span> • {serialConfig.byte_order === 'big' ? 'BE' : 'LE'}</span>
              )}
              {serialConfig.header_length !== undefined && (
                <span> • Header: {serialConfig.header_length}B</span>
              )}
              {serialConfig.fields && Object.keys(serialConfig.fields).length > 0 && (
                <span> • {Object.keys(serialConfig.fields).length} field(s)</span>
              )}
              {serialConfig.checksum && (
                <span> • Checksum: {serialConfig.checksum.algorithm.toUpperCase()}</span>
              )}
            </div>
          )}
        </ProtocolConfigCard>

        {/* Modbus Config */}
        <ProtocolConfigCard
          icon={<Network className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          name="Modbus"
          isConfigured={!!modbusConfig}
          hasFrames={hasModbusFrames}
        >
          {modbusConfig && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              <span>Address: {modbusConfig.device_address}</span>
              <span> • Base: {modbusConfig.register_base}-based</span>
            </div>
          )}
        </ProtocolConfigCard>
      </div>
    </div>
  );
}

// Helper component for protocol config cards
function ProtocolConfigCard({
  icon,
  iconBg,
  name,
  isConfigured,
  hasFrames,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  isConfigured: boolean;
  hasFrames?: boolean;
  children?: React.ReactNode;
}) {
  const showWarning = hasFrames && !isConfigured;

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className={`p-1.5 ${iconBg} rounded`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-slate-900 dark:text-white">{name}</span>
          {isConfigured && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="w-3 h-3" />
              configured
            </span>
          )}
          {showWarning && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              frames exist, no config
            </span>
          )}
          {!isConfigured && !hasFrames && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              not configured
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
