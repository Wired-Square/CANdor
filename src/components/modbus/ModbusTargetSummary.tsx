// ui/src/components/modbus/ModbusTargetSummary.tsx
//
// What a Modbus sweep is about to scan.
//
// The scans used to take a typed-in address, because you couldn't open a Modbus
// session without a catalogue and discovering the device is how you get one.
// They now run against the current session's device instead, so there is nothing
// to choose here — only to state, so you can see which device you are about to
// sweep before you sweep it.

import { useTranslation } from "react-i18next";
import { borderDefault, textMuted, textPrimary } from "../../styles";
import CheckboxField from "../forms/CheckboxField";
import { Field } from "./ModbusFields";
import type { ModbusSessionTarget } from "../../utils/modbusProfiles";

type Props = {
  target: ModbusSessionTarget;
  /**
   * Present on the sweep panels only. The function-code probe is four requests
   * and is not worth a stop/resume cycle around.
   */
  stopSession?: boolean;
  onStopSessionChange?: (next: boolean) => void;
};

export default function ModbusTargetSummary({
  target,
  stopSession,
  onStopSessionChange,
}: Props) {
  const { t } = useTranslation("discovery");

  return (
    <div className={`space-y-2 pb-2 border-b ${borderDefault}`}>
      <Field label={t("modbusTarget.device")}>
        <p className={`${textPrimary} font-mono truncate`}>
          {target.name}
          <span className={textMuted}>
            {" · "}
            {target.host}:{target.port}
            {" · "}
            {t("modbusTarget.unit", { unit: target.unit_id })}
          </span>
        </p>
      </Field>

      {onStopSessionChange && (
        <div className="space-y-1">
          <CheckboxField
            label={t("modbusTarget.stopSession", { device: target.name })}
            checked={stopSession ?? true}
            onChange={onStopSessionChange}
          />
          <p className={textMuted}>{t("modbusTarget.stopSessionHint")}</p>
        </div>
      )}
    </div>
  );
}
