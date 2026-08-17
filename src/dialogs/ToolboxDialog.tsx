// ui/src/dialogs/ToolboxDialog.tsx

import { X, ListOrdered, GitCompare, Play, Loader2, Radio, Binary, ShieldCheck, Radar, Network, ScanSearch } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { iconMd, iconLg } from "../styles/spacing";
import Dialog from "../components/Dialog";
import { useDiscoveryStore, TOOL_TAB_CONFIG, type ToolboxView } from "../stores/discoveryStore";
import {
  cardElevated,
  h3,
  borderDefault,
  paddingCard,
  hoverLight,
  roundedDefault,
  spaceYSmall,
  textTertiary,
} from "../styles";
import MessageOrderToolPanel from "../apps/discovery/views/tools/MessageOrderToolPanel";
import ChangesToolPanel from "../apps/discovery/views/tools/ChangesToolPanel";
import SerialFramingToolPanel from "../apps/discovery/views/tools/SerialFramingToolPanel";
import SerialPayloadToolPanel from "../apps/discovery/views/tools/SerialPayloadToolPanel";
import ChecksumDiscoveryToolPanel from "../apps/discovery/views/tools/ChecksumDiscoveryToolPanel";
import ModbusRegisterScanPanel from "../apps/discovery/views/tools/ModbusRegisterScanPanel";
import ModbusUnitIdScanPanel from "../apps/discovery/views/tools/ModbusUnitIdScanPanel";
import ModbusFunctionCodePanel from "../apps/discovery/views/tools/ModbusFunctionCodePanel";
import type { ModbusScanConfig, UnitIdScanConfig } from "../api/io";
import type { ModbusSessionTarget } from "../utils/modbusProfiles";
import {
  toolNeeds,
  isToolApplicable,
  hasToolData,
  type SessionShape,
  type ToolDataCounts,
} from "./toolboxGating";

type ToolConfig = {
  id: ToolboxView;
  /** Translation key suffix under `toolbox.tools.*` */
  i18nKey: string;
  icon: React.ComponentType<{ className?: string }>;
  /** For serial tools: 'bytes' requires raw bytes, 'frames' requires framed data */
  serialRequires?: 'bytes' | 'frames';
  /** For modbus tools: requires a modbus_tcp profile */
  modbusRequires?: boolean;
};

const tools: ToolConfig[] = [
  { id: "message-order", i18nKey: "messageOrder", icon: ListOrdered },
  { id: "changes", i18nKey: "changes", icon: GitCompare },
  { id: "checksum-discovery", i18nKey: "checksumDiscovery", icon: ShieldCheck },
  { id: "serial-framing", i18nKey: "serialFraming", icon: Binary, serialRequires: 'bytes' },
  { id: "serial-payload", i18nKey: "serialPayload", icon: Radio, serialRequires: 'frames' },
  { id: "modbus-function-codes", i18nKey: "modbusFunctionCodes", icon: ScanSearch, modbusRequires: true },
  { id: "modbus-register-scan", i18nKey: "modbusRegisterScan", icon: Radar, modbusRequires: true },
  { id: "modbus-unit-scan", i18nKey: "modbusUnitScan", icon: Network, modbusRequires: true },
];

/** Modbus tools produce data (or answer a question) rather than analysing a
 *  selection, so they don't get the "run on N selected frames" footer. */
function isModbusScanTool(id: ToolboxView): boolean {
  return id === 'modbus-register-scan' || id === 'modbus-unit-scan' || id === 'modbus-function-codes';
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  frameCount: number;
  /** True when the source emits a raw byte stream — gates the byte view and Serial Framing */
  isSerialMode?: boolean;
  /** True when the session's protocol is serial, however it delivers its data. A source
   *  that frames in the backend has serial frames without ever emitting raw bytes. */
  isSerialProtocol?: boolean;
  /** True when the Filtered tab is active — analysis will target filtered-out IDs */
  isFilteredView?: boolean;
  /** Number of serial frames (framedData + frames) available for analysis */
  serialFrameCount?: number;
  /** Number of raw serial bytes available (before framing) */
  serialBytesCount?: number;
  /**
   * The device the sweeps scan — the current Modbus session's. Null when there
   * is no live Modbus session, which is also what withholds the Modbus tools.
   */
  modbusTarget?: ModbusSessionTarget | null;
  /** Called when a modbus register scan should start */
  onStartModbusScan?: (config: ModbusScanConfig, stopSession: boolean) => void;
  /** Called when a modbus unit ID scan should start */
  onStartModbusUnitIdScan?: (config: UnitIdScanConfig, stopSession: boolean) => void;
};

function getSelectionText(
  t: TFunction,
  activeTool: ToolboxView | null,
  count: number,
  isSerialMode: boolean,
  isFilteredView: boolean,
): string {
  if (activeTool === "serial-framing") {
    return t("toolbox.selection.bytes", { count });
  }
  if (isSerialMode) {
    return isFilteredView
      ? t("toolbox.selection.framesFilteredAvailable", { count })
      : t("toolbox.selection.framesAvailable", { count });
  }
  return isFilteredView
    ? t("toolbox.selection.framesFilteredSelected", { count })
    : t("toolbox.selection.framesSelected", { count });
}

export default function ToolboxDialog({
  isOpen,
  onClose,
  selectedCount,
  frameCount,
  isSerialMode = false,
  isSerialProtocol = false,
  isFilteredView = false,
  serialFrameCount = 0,
  serialBytesCount = 0,
  modbusTarget,
  onStartModbusScan,
  onStartModbusUnitIdScan,
}: Props) {
  const { t } = useTranslation("dialogs");
  const activeView = useDiscoveryStore((s) => s.toolbox.activeView);
  const isRunning = useDiscoveryStore((s) => s.toolbox.isRunning);
  const setActiveView = useDiscoveryStore((s) => s.setActiveView);
  const runAnalysis = useDiscoveryStore((s) => s.runAnalysis);
  const setSerialActiveTab = useDiscoveryStore((s) => s.setSerialActiveTab);

  const activeTool = activeView !== "frames" ? activeView : null;

  const session: SessionShape = {
    isSerialMode,
    isSerialProtocol,
    hasLiveModbusSession: modbusTarget != null,
  };
  const counts: ToolDataCounts = { frameCount, serialFrameCount, serialBytesCount };

  const availableTools = tools.filter((tool) => isToolApplicable(tool, session));
  const isToolAvailable = (tool: ToolConfig): boolean => hasToolData(tool, session, counts);

  const getEffectiveCount = (): number => {
    const tool = activeTool ? tools.find(t => t.id === activeTool) : undefined;
    if (!tool) return 0;
    switch (toolNeeds(tool)) {
      case 'modbus': return 0;
      case 'serial-bytes': return serialBytesCount;
      case 'serial-frames': return serialFrameCount;
      case 'frames': return selectedCount;
    }
  };

  const effectiveSelectedCount = getEffectiveCount();

  const getDisabledReason = (tool: ToolConfig): string | null => {
    switch (toolNeeds(tool)) {
      case 'modbus':
        return modbusTarget ? null : t("toolbox.disabledReasons.modbusSession");
      case 'serial-bytes':
        return serialBytesCount === 0 ? t("toolbox.disabledReasons.noBytes") : null;
      case 'serial-frames':
        return serialFrameCount === 0 ? t("toolbox.disabledReasons.needFraming") : null;
      case 'frames':
        return frameCount === 0 ? t("toolbox.disabledReasons.noFrames") : null;
    }
  };

  const handleToolClick = (toolId: ToolboxView) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool || !isToolAvailable(tool)) return;
    if (activeView === toolId) {
      setActiveView("frames");
    } else {
      setActiveView(toolId);
    }
  };

  const handleRunAnalysis = async () => {
    if (effectiveSelectedCount === 0 || isRunning || !activeTool) return;
    await runAnalysis();
    onClose();
    if (activeTool === "serial-framing" || activeTool === "serial-payload") {
      const config = TOOL_TAB_CONFIG[activeTool];
      if (config) {
        setSerialActiveTab(config.tabId);
      }
    }
  };

  const handleStartModbusScan = (config: ModbusScanConfig, stopSession: boolean) => {
    onStartModbusScan?.(config, stopSession);
    onClose();
  };

  const handleStartModbusUnitIdScan = (config: UnitIdScanConfig, stopSession: boolean) => {
    onStartModbusUnitIdScan?.(config, stopSession);
    onClose();
  };

  const isActiveModbusScan = activeTool != null && isModbusScanTool(activeTool);

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-lg">
      <div className={`${cardElevated} shadow-xl overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`${paddingCard} flex items-center justify-between border-b ${borderDefault}`}>
          <h2 className={h3}>
            {modbusTarget ? t("toolbox.titleAnalysisAndScanning") : t("toolbox.titleAnalysis")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("common:actions.close")}
            className={`p-1 ${roundedDefault} ${hoverLight} transition-colors`}
          >
            <X className={iconLg} />
          </button>
        </div>

        {/* Content */}
        <div className={`${paddingCard} ${spaceYSmall}`}>
          {/* Tool selection */}
          <div className={spaceYSmall}>
            {availableTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              const isDisabled = !isToolAvailable(tool);
              const disabledReason = getDisabledReason(tool);
              const label = t(`toolbox.tools.${tool.i18nKey}.label`);
              const description = t(`toolbox.tools.${tool.i18nKey}.description`);

              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleToolClick(tool.id)}
                  disabled={isDisabled}
                  className={`flex items-start gap-3 w-full p-3 rounded-lg text-left transition-all ${
                    isDisabled
                      ? "bg-[var(--bg-surface)] text-[color:var(--text-muted)] cursor-not-allowed"
                      : isActive
                        ? "bg-purple-100 text-[color:var(--text-purple)] ring-2 ring-purple-500"
                        : "bg-[var(--bg-surface)] text-[color:var(--text-secondary)] ring-1 ring-[color:var(--border-default)] hover:ring-2 hover:ring-purple-400"
                  }`}
                  title={disabledReason ?? label}
                >
                  <Icon className={`${iconLg} mt-0.5 flex-shrink-0 ${isActive ? "text-[color:var(--text-purple)]" : ""}`} />
                  <div>
                    <div className="font-medium text-sm">{label}</div>
                    <div className={`text-xs mt-0.5 ${isActive ? "text-[color:var(--text-purple)] opacity-70" : "text-[color:var(--text-muted)]"}`}>
                      {description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tool-specific options panel */}
          {activeTool && (
            <div className={`border-t ${borderDefault} pt-3`}>
              {activeTool === "message-order" && <MessageOrderToolPanel />}
              {activeTool === "changes" && <ChangesToolPanel />}
              {activeTool === "checksum-discovery" && <ChecksumDiscoveryToolPanel />}
              {activeTool === "serial-framing" && <SerialFramingToolPanel bytesCount={serialBytesCount} />}
              {activeTool === "serial-payload" && <SerialPayloadToolPanel framesCount={serialFrameCount} />}
              {modbusTarget && (
                <>
                  {activeTool === "modbus-function-codes" && (
                    <ModbusFunctionCodePanel target={modbusTarget} />
                  )}
                  {activeTool === "modbus-register-scan" && (
                    <ModbusRegisterScanPanel
                      target={modbusTarget}
                      onStartScan={handleStartModbusScan}
                    />
                  )}
                  {activeTool === "modbus-unit-scan" && (
                    <ModbusUnitIdScanPanel
                      target={modbusTarget}
                      onStartScan={handleStartModbusUnitIdScan}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Selection count and run button (for analysis tools, not modbus scan) */}
          {activeTool && !isActiveModbusScan && (
            <div className={`border-t ${borderDefault} pt-3 ${spaceYSmall}`}>
              <div className={`text-sm ${textTertiary}`}>
                {getSelectionText(t, activeTool, effectiveSelectedCount, isSerialMode, isFilteredView)}
              </div>
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={effectiveSelectedCount === 0 || isRunning}
                className={`flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  effectiveSelectedCount === 0 || isRunning
                    ? "bg-[var(--bg-surface)] text-[color:var(--text-muted)] cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                }`}
              >
                {isRunning ? (
                  <Loader2 className={`${iconMd} animate-spin`} />
                ) : (
                  <Play className={iconMd} />
                )}
                {isRunning ? t("toolbox.running") : t("toolbox.runAnalysis")}
              </button>
            </div>
          )}

          {/* Help text when no tool selected */}
          {!activeTool && availableTools.some(t => isToolAvailable(t)) && (
            <div className={`text-xs ${textTertiary} text-center py-2`}>
              {t("toolbox.selectTool")}
            </div>
          )}

          {/* Help text when no data */}
          {!availableTools.some(t => isToolAvailable(t)) && (
            <div className={`text-xs ${textTertiary} text-center py-2`}>
              {isSerialMode ? t("toolbox.noDataSerial") : t("toolbox.noDataDefault")}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
