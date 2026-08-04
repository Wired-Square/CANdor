// ui/src/components/modbus/ModbusConnectionFields.tsx
//
// Where to point a Modbus scan.
//
// Discovery used to take the connection from whatever Modbus session happened to
// be live, which meant you couldn't scan a device until you'd already managed to
// open a session on it — and opening a Modbus session needs a catalogue, which
// is exactly what you don't have when discovering. So the target is chosen here
// instead: pick a saved profile, or type an address. Picking a profile prefills
// the fields and leaves them editable, which is also how you reach a second
// slave behind a gateway you only have one profile for.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NumberField, SelectField, TextField, FieldRow } from "./ModbusFields";
import { MODBUS_SCAN_BOUNDS } from "./modbusScanDefaults";
import { useModbusProfiles } from "../../utils/modbusProfiles";

export interface ModbusConnection {
  host: string;
  port: number;
  unit_id: number;
}

type Props = {
  value: ModbusConnection;
  onChange: (next: ModbusConnection) => void;
  /** Profile the fields were last seeded from, so the dropdown shows it. */
  profileId: string | null;
  onProfileChange: (profileId: string | null) => void;
  /** Hide the unit field where the scan sweeps unit ids itself. */
  showUnitId?: boolean;
};

export default function ModbusConnectionFields({
  value,
  onChange,
  profileId,
  onProfileChange,
  showUnitId = true,
}: Props) {
  const { t } = useTranslation("discovery");
  const profiles = useModbusProfiles();
  const profileOptions = useMemo(
    () => [
      { value: "", label: t("modbusConnection.manualEntry") },
      ...profiles.map((p) => ({ value: p.id, label: p.name })),
    ],
    [profiles, t]
  );

  return (
    <div className="space-y-3">
      {profiles.length > 0 && (
        <SelectField
          label={t("modbusConnection.profile")}
          value={profileId ?? ""}
          onChange={(id) => onProfileChange(id || null)}
          options={profileOptions}
        />
      )}

      <FieldRow>
        <TextField
          label={t("modbusConnection.host")}
          value={value.host}
          onChange={(host) => onChange({ ...value, host })}
          placeholder="127.0.0.1"
        />
        <NumberField
          label={t("modbusConnection.port")}
          value={value.port}
          onChange={(port) => onChange({ ...value, port })}
          min={1}
          max={65535}
        />
        {showUnitId && (
          <NumberField
            label={t("modbusConnection.unitId")}
            value={value.unit_id}
            onChange={(unit_id) => onChange({ ...value, unit_id })}
            min={MODBUS_SCAN_BOUNDS.unitId.min}
            max={MODBUS_SCAN_BOUNDS.unitId.max}
          />
        )}
      </FieldRow>
    </div>
  );
}
