// ui/src/utils/modbusProfiles.ts
//
// Small predicates over IO profiles that several apps need when deciding
// whether Modbus polling applies to a session.

import { useSettingsStore } from "../apps/settings/stores/settingsStore";

/** The profile kind that carries Modbus polling. */
const MODBUS_PROFILE_KIND = "modbus_tcp";

/**
 * Just enough of a profile to read an address off it.
 *
 * Two `IOProfile` types are in play — the settings union and the lighter one in
 * `types/common` that several apps pass around — and both carry the same
 * connection fields. Accepting the shape rather than either name lets callers
 * use whichever they already hold.
 */
type HasModbusConnection = {
  connection?: { host?: unknown; port?: unknown; unit_id?: unknown };
};

/**
 * True if any of these profiles is a Modbus source — the only kind polls apply to.
 *
 * Reads the store imperatively rather than through a selector on purpose: this
 * is a decision made inside callbacks, and subscribing would re-render every
 * consumer whenever any unrelated profile changed.
 */
export function anyModbusProfile(profileIds: string[]): boolean {
  const profiles = useSettingsStore.getState().ioProfiles.profiles;
  return profileIds.some((id) => profiles.find((p) => p.id === id)?.kind === MODBUS_PROFILE_KIND);
}

/** A Modbus device address. */
export interface ModbusConnection {
  host: string;
  port: number;
  unit_id: number;
}

/**
 * The device a Discovery sweep runs against: the current Modbus session's own.
 *
 * The scans no longer take a typed-in address — they scan what the session is
 * connected to — so they need the session and profile ids as well as the address
 * itself. The address is carried for display; the backend re-resolves it from
 * `sessionId` so the two cannot drift.
 */
export interface ModbusSessionTarget extends ModbusConnection {
  sessionId: string;
  profileId: string;
  /** Profile display name, for naming the device on screen. */
  name: string;
}

/** Host/port/unit from a Modbus profile's connection map, with the usual defaults. */
export function modbusConnectionOf(
  profile: HasModbusConnection | undefined | null
): ModbusConnection {
  return {
    host: String(profile?.connection?.host ?? "127.0.0.1"),
    port: Number(profile?.connection?.port) || 502,
    unit_id: Number(profile?.connection?.unit_id) || 1,
  };
}
