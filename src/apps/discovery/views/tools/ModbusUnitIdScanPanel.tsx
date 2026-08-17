// ui/src/apps/discovery/views/tools/ModbusUnitIdScanPanel.tsx

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { iconSm } from "../../../../styles/spacing";
import { borderDefault, textMuted } from "../../../../styles";
import ModbusTargetSummary from "../../../../components/modbus/ModbusTargetSummary";
import { FieldRow, NumberField, RunButton, SelectField } from "../../../../components/modbus/ModbusFields";
import {
  MODBUS_SCAN_BOUNDS,
  MODBUS_SCAN_DEFAULTS,
} from "../../../../components/modbus/modbusScanDefaults";
import type { ModbusSessionTarget } from "../../../../utils/modbusProfiles";
import type { UnitIdScanConfig, ModbusRegisterType } from "../../../../api/io";

type Props = {
  /** The device this sweep runs against — the current session's. */
  target: ModbusSessionTarget;
  onStartScan: (config: UnitIdScanConfig, stopSession: boolean) => void;
};

export default function ModbusUnitIdScanPanel({ target, onStartScan }: Props) {
  const { t } = useTranslation("discovery");

  // See ModbusRegisterScanPanel: stopping is what frees a single-conversation device.
  const [stopSession, setStopSession] = useState(true);

  const [startUnitId, setStartUnitId] = useState(1);
  const [endUnitId, setEndUnitId] = useState(247);
  const [testRegister, setTestRegister] = useState(0);
  const [registerType, setRegisterType] = useState<ModbusRegisterType>("holding");
  const [delayMs, setDelayMs] = useState(MODBUS_SCAN_DEFAULTS.interRequestDelayMs);
  const [timeoutMs, setTimeoutMs] = useState(MODBUS_SCAN_DEFAULTS.timeoutMs);

  const handleStart = () => {
    // The sweep supplies its own unit ids; Rust supplies the address from the
    // session. Nothing here names a device.
    onStartScan({
      start_unit_id: startUnitId,
      end_unit_id: endUnitId,
      test_register: testRegister,
      register_type: registerType,
      inter_request_delay_ms: delayMs,
      timeout_ms: timeoutMs,
    }, stopSession);
  };

  const isValid = startUnitId <= endUnitId;

  return (
    <div className="space-y-3 text-xs">
      <ModbusTargetSummary
        target={target}
        stopSession={stopSession}
        onStopSessionChange={setStopSession}
      />

      <FieldRow>
        <NumberField
          label={t("modbusUnitId.startUnitId")}
          value={startUnitId}
          onChange={setStartUnitId}
          min={1}
          max={247}
        />
        <NumberField
          label={t("modbusUnitId.endUnitId")}
          value={endUnitId}
          onChange={setEndUnitId}
          min={1}
          max={247}
        />
      </FieldRow>

      {/* FC43 info */}
      <div className="flex items-start gap-2 px-2 py-1.5 rounded bg-[var(--bg-surface)] border border-[color:var(--border-default)]">
        <Info className={`${iconSm} shrink-0 mt-0.5 text-purple-400`} />
        <span className={textMuted}>
          {t("modbusUnitId.fc43DescriptionPrefix")}
          <strong className="text-[color:var(--text-secondary)]">
            {t("modbusUnitId.fc43Title")}
          </strong>
          {t("modbusUnitId.fc43DescriptionSuffix")}
        </span>
      </div>

      {/* Fallback register config */}
      <div className="space-y-2 pt-1">
        <label className={`${textMuted} text-[10px] uppercase tracking-wider`}>
          {t("modbusUnitId.fallbackProbe")}
        </label>
        <FieldRow>
          <NumberField
            label={t("modbusUnitId.register")}
            value={testRegister}
            onChange={setTestRegister}
            min={MODBUS_SCAN_BOUNDS.register.min}
            max={MODBUS_SCAN_BOUNDS.register.max}
          />
          <SelectField
            label={t("modbusUnitId.type")}
            value={registerType}
            onChange={setRegisterType}
            options={[
              { value: "holding", label: t("modbusUnitId.holdingFc") },
              { value: "input", label: t("modbusUnitId.inputFc") },
              { value: "coil", label: t("modbusUnitId.coilFc") },
              { value: "discrete", label: t("modbusUnitId.discreteFc") },
            ]}
          />
        </FieldRow>
      </div>

      <FieldRow>
        <NumberField
          label={t("modbusUnitId.delayMs")}
          value={delayMs}
          onChange={setDelayMs}
          min={MODBUS_SCAN_BOUNDS.delayMs.min}
          max={MODBUS_SCAN_BOUNDS.delayMs.max}
        />
        <NumberField
          label={t("modbusRegister.timeoutMs")}
          value={timeoutMs}
          onChange={setTimeoutMs}
          min={MODBUS_SCAN_BOUNDS.timeoutMs.min}
          max={MODBUS_SCAN_BOUNDS.timeoutMs.max}
        />
      </FieldRow>

      <p className={`${textMuted} pt-2 border-t ${borderDefault}`}>
        {t("modbusUnitId.scanDescription", {
          device: target.name,
          start: startUnitId,
          end: endUnitId,
          type: registerType,
          register: testRegister,
        })}
      </p>

      <RunButton label={t("modbusUnitId.runScan")} onClick={handleStart} disabled={!isValid} />
    </div>
  );
}
