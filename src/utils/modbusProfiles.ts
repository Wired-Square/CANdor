// ui/src/utils/modbusProfiles.ts
//
// Small predicates over IO profiles that several apps need when deciding
// whether Modbus polling applies to a session.

import { useMemo } from "react";
import { useSettingsStore } from "../apps/settings/stores/settingsStore";
import type { IOProfile } from "../settings/appSettings";

/** The profile kind that carries Modbus polling. */
const MODBUS_PROFILE_KIND = "modbus_tcp";

/** A Modbus profile, narrowed out of the profile-kind union. */
export type ModbusProfile = Extract<IOProfile, { kind: "modbus_tcp" }>;

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

function isModbusProfile(p: IOProfile): p is ModbusProfile {
  return p.kind === MODBUS_PROFILE_KIND;
}

/**
 * Every configured Modbus profile. Imperative, for one-shot reads inside
 * callbacks and state initialisers — use `useModbusProfiles` to render from.
 */
export function modbusProfiles(): ModbusProfile[] {
  return useSettingsStore.getState().ioProfiles.profiles.filter(isModbusProfile);
}

/**
 * The reactive form, for anything that renders a profile list or gates on one.
 *
 * Both the tool gate and the target picker must read this same store: when they
 * came from different sources, Discovery could decide the Modbus tools were
 * available while the picker beside them had nothing to offer.
 */
export function useModbusProfiles(): ModbusProfile[] {
  const profiles = useSettingsStore((s) => s.ioProfiles.profiles);
  return useMemo(() => profiles.filter(isModbusProfile), [profiles]);
}

/** Host/port/unit from a Modbus profile's connection map, with the usual defaults. */
export function modbusConnectionOf(profile: HasModbusConnection | undefined | null): {
  host: string;
  port: number;
  unit_id: number;
} {
  return {
    host: String(profile?.connection?.host ?? "127.0.0.1"),
    port: Number(profile?.connection?.port) || 502,
    unit_id: Number(profile?.connection?.unit_id) || 1,
  };
}
