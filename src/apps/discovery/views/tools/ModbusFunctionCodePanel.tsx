// ui/src/apps/discovery/views/tools/ModbusFunctionCodePanel.tsx
//
// "Which function codes does this thing answer?" — the cheapest first question
// to ask an unknown Modbus device, and the one that decides what a sweep should
// even look for. Four requests per unit, and it runs inline rather than as a
// session because it produces an answer rather than a stream.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { borderDefault, textMuted, textPrimary, textSecondary } from "../../../../styles";
import ModbusConnectionFields, {
  type ModbusConnection,
} from "../../../../components/modbus/ModbusConnectionFields";
import { FieldRow, NumberField, RunButton, TextField } from "../../../../components/modbus/ModbusFields";
import {
  MODBUS_SCAN_BOUNDS,
  MODBUS_SCAN_DEFAULTS,
} from "../../../../components/modbus/modbusScanDefaults";
import { useModbusTarget } from "../../../../components/modbus/useModbusTarget";
import { probeModbusFunctionCodes, type FcProbeEntry, type FcVerdict } from "../../../../api/io";

type Props = {
  connection?: ModbusConnection | null;
};

/** Verdict → a short label plus the colour that carries the meaning. */
function verdictLabel(v: FcVerdict, t: (k: string) => string): { text: string; className: string } {
  switch (v.verdict) {
    case "values":
      return {
        text: v.values.length > 0 ? `0x${v.values[0].toString(16).padStart(4, "0").toUpperCase()}` : t("modbusFc.ok"),
        className: "text-green-500",
      };
    case "bits":
      return { text: v.values[0] ? "1" : "0", className: "text-green-500" };
    case "exception":
      // An exception still proves the function code is implemented — the address
      // was simply wrong. That is a materially different finding from silence.
      return { text: t("modbusFc.exception"), className: "text-amber-500" };
    case "silent":
      return { text: t("modbusFc.silent"), className: "text-[color:var(--text-muted)]" };
  }
}

export default function ModbusFunctionCodePanel({ connection }: Props) {
  const { t } = useTranslation("discovery");
  const target = useModbusTarget(connection);

  const [unitIdsText, setUnitIdsText] = useState("1, 0, 255, 2, 3");
  const [testRegister, setTestRegister] = useState(0);
  const [timeoutMs, setTimeoutMs] = useState(MODBUS_SCAN_DEFAULTS.timeoutMs);
  const [results, setResults] = useState<FcProbeEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitIds = unitIdsText
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 255);

  const handleProbe = async () => {
    setBusy(true);
    setError(null);
    try {
      setResults(
        await probeModbusFunctionCodes({
          host: target.connection.host,
          port: target.connection.port,
          unit_ids: unitIds,
          test_register: testRegister,
          timeout_ms: timeoutMs,
        })
      );
    } catch (e) {
      setError(String(e));
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  // Keyed to just the four verdict fields, so the cells need no cast.
  const columns: Array<{ key: "holding" | "input" | "coil" | "discrete"; label: string }> = [
    { key: "holding", label: t("modbusFc.holding") },
    { key: "input", label: t("modbusFc.input") },
    { key: "coil", label: t("modbusFc.coil") },
    { key: "discrete", label: t("modbusFc.discrete") },
  ];

  return (
    <div className="space-y-3 text-xs">
      <ModbusConnectionFields
        value={target.connection}
        onChange={target.setConnection}
        profileId={target.profileId}
        onProfileChange={target.selectProfile}
        showUnitId={false}
      />

      <FieldRow>
        <TextField
          label={t("modbusFc.unitIds")}
          value={unitIdsText}
          onChange={setUnitIdsText}
          placeholder="1, 0, 255"
        />
        <NumberField
          label={t("modbusFc.testRegister")}
          value={testRegister}
          onChange={setTestRegister}
          min={MODBUS_SCAN_BOUNDS.register.min}
          max={MODBUS_SCAN_BOUNDS.register.max}
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
        {t("modbusFc.description", { count: unitIds.length, requests: unitIds.length * 4 })}
      </p>

      <RunButton
        label={busy ? t("modbusFc.probing") : t("modbusFc.runProbe")}
        onClick={handleProbe}
        disabled={busy || unitIds.length === 0}
        busy={busy}
      />

      {error && <p className="text-red-500">{error}</p>}

      {results && (
        <div className={`pt-2 border-t ${borderDefault} space-y-2`}>
          <table className="w-full">
            <thead>
              <tr className={`border-b ${borderDefault}`}>
                <th className={`text-left py-1 font-medium ${textMuted}`}>{t("modbusFc.unit")}</th>
                {columns.map((c) => (
                  <th key={c.key} className={`text-left py-1 font-medium ${textMuted}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.unit_id} className="border-b border-[color:var(--border-default)]/30">
                  <td className={`py-1 font-mono ${textPrimary}`}>{r.unit_id}</td>
                  {columns.map((c) => {
                    const { text, className } = verdictLabel(r[c.key], t);
                    return (
                      <td key={c.key} className={`py-1 font-mono ${className}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className={textSecondary}>
            {results.some((r) => r.responded)
              ? t("modbusFc.hintFound")
              : t("modbusFc.hintNothing")}
          </p>
        </div>
      )}
    </div>
  );
}
