// ui/src/components/modbus/useModbusTarget.ts

import { useCallback, useState } from "react";
import type { ModbusConnection } from "./ModbusConnectionFields";
import { MODBUS_DEFAULT_CONNECTION } from "./modbusScanDefaults";
import { modbusConnectionOf, modbusProfiles } from "../../utils/modbusProfiles";

/**
 * The address a Modbus tool points at, seeded from a profile but editable.
 *
 * Resolution order for the initial value: the live session's Modbus profile if
 * there is one, else the first configured Modbus profile, else localhost. That
 * ordering means the common case (a session is already open) needs no input,
 * while the discovery case (no session, maybe no profile) still has somewhere
 * to start.
 */
export function useModbusTarget(sessionConnection?: ModbusConnection | null) {
  const [profileId, setProfileId] = useState<string | null>(() =>
    sessionConnection ? null : modbusProfiles()[0]?.id ?? null
  );
  const [connection, setConnection] = useState<ModbusConnection>(() => {
    if (sessionConnection) return sessionConnection;
    const first = modbusProfiles()[0];
    return first ? modbusConnectionOf(first) : { ...MODBUS_DEFAULT_CONNECTION };
  });

  /** Selecting a profile refills the fields; they stay editable afterwards. */
  const selectProfile = useCallback((id: string | null) => {
    setProfileId(id);
    if (!id) return;
    const profile = modbusProfiles().find((p) => p.id === id);
    if (profile) setConnection(modbusConnectionOf(profile));
  }, []);

  return { profileId, connection, setConnection, selectProfile };
}
