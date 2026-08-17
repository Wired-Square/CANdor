// ui/src/apps/discovery/views/tools/ModbusRegisterScanPanel.tsx

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { iconSm } from "../../../../styles/spacing";
import { borderDefault, textMuted } from "../../../../styles";
import ModbusTargetSummary from "../../../../components/modbus/ModbusTargetSummary";
import {
  CheckboxRow,
  FieldRow,
  NumberField,
  RunButton,
  SelectField,
} from "../../../../components/modbus/ModbusFields";
import {
  MODBUS_SCAN_BOUNDS,
  MODBUS_SCAN_DEFAULTS,
  maxChunkFor,
} from "../../../../components/modbus/modbusScanDefaults";
import type { ModbusSessionTarget } from "../../../../utils/modbusProfiles";
import type { ModbusScanConfig, ModbusRegisterType } from "../../../../api/io";

type Props = {
  /** The device this sweep runs against — the current session's. */
  target: ModbusSessionTarget;
  onStartScan: (config: ModbusScanConfig, stopSession: boolean) => void;
};

export default function ModbusRegisterScanPanel({ target, onStartScan }: Props) {
  const { t } = useTranslation("discovery");

  // The address comes from the session, but the slave does not: a unit-id sweep
  // exists to find *other* slaves behind one host:port, and you need to be able
  // to sweep the one it finds.
  const [unitId, setUnitId] = useState(target.unit_id);
  // Most devices serve one Modbus conversation at a time, and pausing keeps the
  // socket — only stopping frees it. Default to handing the device over.
  const [stopSession, setStopSession] = useState(true);

  const [registerType, setRegisterType] = useState<ModbusRegisterType>(
    MODBUS_SCAN_DEFAULTS.registerType
  );
  const [startRegister, setStartRegister] = useState(MODBUS_SCAN_DEFAULTS.startRegister);
  const [endRegister, setEndRegister] = useState(MODBUS_SCAN_DEFAULTS.endRegister);
  const [chunkSize, setChunkSize] = useState(maxChunkFor(MODBUS_SCAN_DEFAULTS.registerType));
  const [delayMs, setDelayMs] = useState(MODBUS_SCAN_DEFAULTS.interRequestDelayMs);
  const [repeat, setRepeat] = useState(MODBUS_SCAN_DEFAULTS.repeat);
  const [repeatDelayMs, setRepeatDelayMs] = useState(MODBUS_SCAN_DEFAULTS.repeatDelayMs);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(MODBUS_SCAN_DEFAULTS.timeoutMs);
  const [reconnectPerRequest, setReconnectPerRequest] = useState(
    MODBUS_SCAN_DEFAULTS.reconnectPerRequest
  );
  const [connectSettleMs, setConnectSettleMs] = useState(MODBUS_SCAN_DEFAULTS.connectSettleMs);
  const [maxConsecutiveTimeouts, setMaxConsecutiveTimeouts] = useState(
    MODBUS_SCAN_DEFAULTS.maxConsecutiveTimeouts
  );
  const [maxRequests, setMaxRequests] = useState(MODBUS_SCAN_DEFAULTS.maxRequests);

  const maxChunk = maxChunkFor(registerType);

  const handleRegisterTypeChange = (type: ModbusRegisterType) => {
    setRegisterType(type);
    setChunkSize(maxChunkFor(type));
  };

  // Per-request reconnect and a settle delay go together: both exist for cheap
  // stacks that serve one conversation per socket, and such a device usually
  // needs a moment after connecting before its first reply is readable.
  const handleReconnectChange = (on: boolean) => {
    setReconnectPerRequest(on);
    if (on && connectSettleMs === 0) {
      setConnectSettleMs(MODBUS_SCAN_DEFAULTS.connectSettleWithReconnectMs);
    }
  };

  const registerCount = Math.max(0, endRegister - startRegister + 1);
  const overRegisterCap = registerCount > MODBUS_SCAN_DEFAULTS.maxRegisters;
  const isValid = startRegister <= endRegister && chunkSize > 0 && !overRegisterCap;

  const handleStart = () => {
    // No host/port: Rust resolves them from the session, so the sweep cannot
    // drift from the device named on screen.
    onStartScan({
      unit_id: unitId,
      register_type: registerType,
      start_register: startRegister,
      end_register: endRegister,
      chunk_size: Math.min(chunkSize, maxChunk),
      inter_request_delay_ms: delayMs,
      timeout_ms: timeoutMs,
      connect_settle_ms: connectSettleMs,
      reconnect_per_request: reconnectPerRequest,
      max_consecutive_timeouts: maxConsecutiveTimeouts,
      max_requests: maxRequests,
      repeat,
      repeat_delay_ms: repeatDelayMs,
    }, stopSession);
  };

  return (
    <div className="space-y-3 text-xs">
      <ModbusTargetSummary
        target={target}
        stopSession={stopSession}
        onStopSessionChange={setStopSession}
      />

      <FieldRow>
        <SelectField
          label={t("modbusRegister.registerType")}
          value={registerType}
          onChange={handleRegisterTypeChange}
          options={[
            { value: "holding", label: t("modbusRegister.holdingFc") },
            { value: "input", label: t("modbusRegister.inputFc") },
            { value: "coil", label: t("modbusRegister.coilFc") },
            { value: "discrete", label: t("modbusRegister.discreteFc") },
          ]}
        />
        <NumberField
          label={t("modbusRegister.unitId")}
          value={unitId}
          onChange={setUnitId}
          min={MODBUS_SCAN_BOUNDS.unitId.min}
          max={MODBUS_SCAN_BOUNDS.unitId.max}
        />
        <NumberField
          label={t("modbusRegister.startRegister")}
          value={startRegister}
          onChange={setStartRegister}
          min={MODBUS_SCAN_BOUNDS.register.min}
          max={MODBUS_SCAN_BOUNDS.register.max}
        />
        <NumberField
          label={t("modbusRegister.endRegister")}
          value={endRegister}
          onChange={setEndRegister}
          min={MODBUS_SCAN_BOUNDS.register.min}
          max={MODBUS_SCAN_BOUNDS.register.max}
        />
      </FieldRow>

      <FieldRow>
        <NumberField
          label={t("modbusRegister.chunkSize")}
          value={chunkSize}
          onChange={setChunkSize}
          min={1}
          max={maxChunk}
        />
        <NumberField
          label={t("modbusRegister.delayMs")}
          value={delayMs}
          onChange={setDelayMs}
          min={MODBUS_SCAN_BOUNDS.delayMs.min}
          max={MODBUS_SCAN_BOUNDS.delayMs.max}
        />
      </FieldRow>

      <FieldRow>
        <NumberField
          label={t("modbusRegister.passes")}
          value={repeat}
          onChange={setRepeat}
          min={MODBUS_SCAN_BOUNDS.repeat.min}
          max={MODBUS_SCAN_BOUNDS.repeat.max}
        />
        <NumberField
          label={t("modbusRegister.passGapMs")}
          value={repeatDelayMs}
          onChange={setRepeatDelayMs}
          min={MODBUS_SCAN_BOUNDS.repeatDelayMs.min}
          max={MODBUS_SCAN_BOUNDS.repeatDelayMs.max}
          disabled={repeat < 2}
        />
      </FieldRow>
      {repeat > 1 && <p className={textMuted}>{t("modbusRegister.passesHint")}</p>}

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className={`flex items-center gap-1 ${textMuted} hover:text-[color:var(--text-primary)]`}
      >
        {showAdvanced ? <ChevronDown className={iconSm} /> : <ChevronRight className={iconSm} />}
        {t("modbusRegister.advanced")}
      </button>

      {showAdvanced && (
        <div className={`space-y-3 pl-2 border-l ${borderDefault}`}>
          <FieldRow>
            <NumberField
              label={t("modbusRegister.timeoutMs")}
              value={timeoutMs}
              onChange={setTimeoutMs}
              min={MODBUS_SCAN_BOUNDS.timeoutMs.min}
              max={MODBUS_SCAN_BOUNDS.timeoutMs.max}
            />
            <NumberField
              label={t("modbusRegister.maxConsecutiveTimeouts")}
              value={maxConsecutiveTimeouts}
              onChange={setMaxConsecutiveTimeouts}
              min={MODBUS_SCAN_BOUNDS.consecutiveTimeouts.min}
              max={MODBUS_SCAN_BOUNDS.consecutiveTimeouts.max}
            />
          </FieldRow>
          <FieldRow>
            <NumberField
              label={t("modbusRegister.maxRequests")}
              value={maxRequests}
              onChange={setMaxRequests}
              min={MODBUS_SCAN_BOUNDS.maxRequests.min}
              max={MODBUS_SCAN_BOUNDS.maxRequests.max}
            />
            <NumberField
              label={t("modbusRegister.connectSettleMs")}
              value={connectSettleMs}
              onChange={setConnectSettleMs}
              min={MODBUS_SCAN_BOUNDS.settleMs.min}
              max={MODBUS_SCAN_BOUNDS.settleMs.max}
            />
          </FieldRow>
          <FieldRow>
            <CheckboxRow
              label={t("modbusRegister.reconnectPerRequest")}
              checked={reconnectPerRequest}
              onChange={handleReconnectChange}
            />
          </FieldRow>
          <p className={textMuted}>{t("modbusRegister.advancedHint")}</p>
        </div>
      )}

      <p className={`${textMuted} pt-2 border-t ${borderDefault}`}>
        {t("modbusRegister.scanDescription", {
          device: target.name,
          unit: unitId,
          type: registerType,
          start: startRegister,
          end: endRegister,
        })}
      </p>
      {overRegisterCap && (
        <p className="text-amber-500">
          {t("modbusRegister.tooManyRegisters", {
            count: registerCount,
            max: MODBUS_SCAN_DEFAULTS.maxRegisters,
          })}
        </p>
      )}

      <RunButton label={t("modbusRegister.runScan")} onClick={handleStart} disabled={!isValid} />
    </div>
  );
}
