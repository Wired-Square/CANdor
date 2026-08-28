// src/components/io/useConnectionProbe.ts
//
// Debounced device probing for a profile form that is still being edited.
// Shared by the Settings profile dialog and the source picker's device editor,
// so both show live device status as connection parameters are typed.
//
// slcan, gs_usb and FrameLink probe from loose parameters, so they work on an
// unsaved device. GVRET's probe goes through `probe_device`, which resolves a
// profile by id — an ad-hoc device must be registered before it can be probed.

import { useCallback, useEffect, useState } from "react";
import { PROBE_DEBOUNCE_MS } from "../../constants";
import { probeSlcanDevice } from "../../api/serial";
import { probeGsUsbDevice } from "../../api/gs_usb";
import { probeDevice, type GvretDeviceInfo } from "../../api/io";
import { framelinkProbeDevice } from "../../api/framelink";
import type {
  DeviceProbeState,
  DeviceProbeResult,
} from "./IODeviceStatus";
import { isProfileKind, type IOProfile, type GvretInterfaceConfig } from "../../settings/appSettings";
import { getPlatform } from "../../utils/platform";
import { getAvailableProfileKinds, type Platform, type ProfileKind } from "../../utils/profileTraits";

/** Platform flags and the profile kinds this platform can offer. */
export interface PlatformInfo {
  isWindows: boolean;
  isLinux: boolean;
  isMacos: boolean;
  availableKinds: ProfileKind[];
}

/** Resolve platform once; several device blocks branch on it. */
export function usePlatformInfo(): PlatformInfo {
  const [info, setInfo] = useState<PlatformInfo>({
    isWindows: false,
    isLinux: false,
    isMacos: false,
    availableKinds: [],
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // One call settles all four — the flags are just this value compared.
      const platform = await getPlatform();
      if (cancelled) return;
      setInfo({
        isWindows: platform === "windows",
        isLinux: platform === "linux",
        isMacos: platform === "macos",
        availableKinds: getAvailableProfileKinds(platform as Platform),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}

export interface ConnectionProbe {
  slcanState: DeviceProbeState;
  slcanResult: DeviceProbeResult | null;
  probeSlcan: () => Promise<void>;

  gsUsbState: DeviceProbeState;
  gsUsbResult: DeviceProbeResult | null;
  probeGsUsb: () => Promise<void>;

  gvretState: DeviceProbeState;
  gvretDeviceInfo: GvretDeviceInfo | null;
  gvretError: string | null;
  probeGvret: () => Promise<void>;

  framelinkState: DeviceProbeState;
  framelinkError: string | null;
  probeFramelink: () => Promise<void>;
}

export interface UseConnectionProbeOptions {
  /** The profile form being edited. */
  profile: IOProfile;
  /** Whether the form is on screen; probing stops when it is not. */
  active: boolean;
  /** Platform flags — gs_usb probes only on Windows/macOS. */
  platform: PlatformInfo;
  /**
   * The profile id GVRET's probe should resolve. Null when the device is not
   * registered anywhere yet, which the caller surfaces as "save first".
   */
  probeProfileId: string | null;
  /** Apply a probe result back onto the form (interfaces, bus count). */
  onUpdateConnectionField: (key: string, value: unknown) => void;
  /** Label for a failed GVRET probe. */
  probeFailedText: string;
}

export function useConnectionProbe({
  profile,
  active,
  platform,
  probeProfileId,
  onUpdateConnectionField,
  probeFailedText,
}: UseConnectionProbeOptions): ConnectionProbe {
  const [slcanState, setSlcanState] = useState<DeviceProbeState>("idle");
  const [slcanResult, setSlcanResult] = useState<DeviceProbeResult | null>(null);
  const [gsUsbState, setGsUsbState] = useState<DeviceProbeState>("idle");
  const [gsUsbResult, setGsUsbResult] = useState<DeviceProbeResult | null>(null);
  const [gvretState, setGvretState] = useState<DeviceProbeState>("idle");
  const [gvretDeviceInfo, setGvretDeviceInfo] = useState<GvretDeviceInfo | null>(null);
  const [gvretError, setGvretError] = useState<string | null>(null);
  const [framelinkState, setFramelinkState] = useState<DeviceProbeState>("idle");
  const [framelinkError, setFramelinkError] = useState<string | null>(null);

  // ── slcan ──────────────────────────────────────────────────────────────────

  const probeSlcan = useCallback(async () => {
    if (!isProfileKind(profile, "slcan")) return;
    const { port, baud_rate, data_bits, stop_bits, parity } = profile.connection;
    if (!port) {
      setSlcanState("idle");
      setSlcanResult(null);
      return;
    }

    setSlcanState("probing");
    try {
      const result = await probeSlcanDevice(port, parseInt(baud_rate || "115200", 10), {
        dataBits: parseInt(data_bits || "8", 10),
        stopBits: parseInt(stop_bits || "1", 10),
        parity: parity || "none",
      });
      setSlcanResult({
        success: result.success,
        primaryInfo: result.version,
        secondaryInfo: result.hardware_version,
        supports_fd: result.supports_fd,
        error: result.error,
      });
      setSlcanState(result.success ? "success" : "error");
    } catch (e) {
      setSlcanResult({ success: false, error: e instanceof Error ? e.message : String(e) });
      setSlcanState("error");
    }
  }, [profile]);

  useEffect(() => {
    if (!active || !isProfileKind(profile, "slcan") || !profile.connection.port) {
      setSlcanState("idle");
      setSlcanResult(null);
      return;
    }
    // Debounce so a half-typed port or a baud rate mid-change is not probed.
    const timer = setTimeout(() => void probeSlcan(), PROBE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, profile, probeSlcan]);

  // ── gs_usb (Windows/macOS use the nusb userspace driver) ───────────────────

  const probeGsUsb = useCallback(async () => {
    if (!platform.isWindows && !platform.isMacos) return;
    if (!isProfileKind(profile, "gs_usb")) return;

    const bus = parseInt(profile.connection.bus || "0", 10);
    const address = parseInt(profile.connection.address || "0", 10);
    if (!bus && !address) {
      setGsUsbState("idle");
      setGsUsbResult(null);
      return;
    }

    setGsUsbState("probing");
    try {
      // Serial is passed for stable matching across USB re-enumeration.
      const result = await probeGsUsbDevice(bus, address, profile.connection.serial || null);
      setGsUsbResult({
        success: result.success,
        primaryInfo: result.channel_count ? `${result.channel_count} channel(s)` : undefined,
        secondaryInfo: result.supports_fd ? "CAN FD supported" : undefined,
        error: result.error || undefined,
      });
      setGsUsbState(result.success ? "success" : "error");
    } catch (e) {
      setGsUsbResult({ success: false, error: e instanceof Error ? e.message : String(e) });
      setGsUsbState("error");
    }
  }, [platform.isWindows, platform.isMacos, profile]);

  useEffect(() => {
    const canProbe = platform.isWindows || platform.isMacos;
    if (
      !active ||
      !canProbe ||
      !isProfileKind(profile, "gs_usb") ||
      (!profile.connection.bus && !profile.connection.address)
    ) {
      setGsUsbState("idle");
      setGsUsbResult(null);
      return;
    }
    const timer = setTimeout(() => void probeGsUsb(), PROBE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, profile, platform.isWindows, platform.isMacos, probeGsUsb]);

  // ── GVRET (resolves a registered profile by id) ────────────────────────────

  const probeGvret = useCallback(async () => {
    if (profile.kind !== "gvret_tcp" && profile.kind !== "gvret_usb") return;
    if (!probeProfileId) {
      setGvretError(probeFailedText);
      setGvretState("error");
      return;
    }

    setGvretState("probing");
    setGvretError(null);
    try {
      const result = await probeDevice(probeProfileId);
      if (!result.success) {
        setGvretError(result.error || probeFailedText);
        setGvretState("error");
        return;
      }

      setGvretDeviceInfo({ bus_count: result.busCount });
      setGvretState("success");

      const configuredCount = profile.connection.interfaces?.length || 0;
      if (configuredCount === 0) {
        const defaults: GvretInterfaceConfig[] = Array.from(
          { length: result.busCount },
          (_, i) => ({ device_bus: i, enabled: true, protocol: "can" as const }),
        );
        onUpdateConnectionField("interfaces", defaults);
      } else if (configuredCount !== result.busCount) {
        // Keep the user's config, but say the device disagrees with it.
        setGvretError(
          `Device reports ${result.busCount} interface(s), but ${configuredCount} configured. ` +
            `Delete interfaces field in settings to re-probe.`,
        );
      }
      onUpdateConnectionField("_probed_bus_count", result.busCount);
    } catch (e) {
      setGvretError(e instanceof Error ? e.message : String(e));
      setGvretState("error");
    }
  }, [probeProfileId, profile, onUpdateConnectionField, probeFailedText]);

  // Seed from the bus count a previous probe stored on the profile. Reuse the
  // previous object when the count is unchanged — this runs on every keystroke,
  // and a fresh object would force a render each time.
  useEffect(() => {
    if (!active) return;
    if (!isProfileKind(profile, "gvret_tcp") && !isProfileKind(profile, "gvret_usb")) return;
    const busCount = profile.connection._probed_bus_count;
    if (typeof busCount === "number" && busCount > 0) {
      setGvretDeviceInfo((prev) => (prev?.bus_count === busCount ? prev : { bus_count: busCount }));
      setGvretState("success");
    }
  }, [active, profile]);

  useEffect(() => {
    if (!active || (profile.kind !== "gvret_tcp" && profile.kind !== "gvret_usb")) {
      setGvretState("idle");
      setGvretDeviceInfo(null);
      setGvretError(null);
    }
  }, [active, profile.kind]);

  // ── FrameLink (probes from loose host/port, so it works unsaved) ───────────

  const probeFramelink = useCallback(async () => {
    if (!isProfileKind(profile, "framelink")) return;
    const { host, port } = profile.connection;
    if (!host) return;

    setFramelinkState("probing");
    setFramelinkError(null);
    try {
      const result = await framelinkProbeDevice(host, Number(port) || 120, 5);
      onUpdateConnectionField(
        "interfaces",
        result.interfaces.map((i) => ({
          index: i.index,
          iface_type: i.iface_type,
          name: i.name,
          type_name: i.type_name,
        })),
      );
      if (result.device_id) onUpdateConnectionField("device_id", result.device_id);
      if (result.board_name) onUpdateConnectionField("board_name", result.board_name);
      if (result.board_revision) {
        onUpdateConnectionField("board_revision", result.board_revision);
      }
      setFramelinkState("success");
    } catch (e) {
      setFramelinkError(e instanceof Error ? e.message : String(e));
      setFramelinkState("error");
    }
  }, [profile, onUpdateConnectionField]);

  return {
    slcanState,
    slcanResult,
    probeSlcan,
    gsUsbState,
    gsUsbResult,
    probeGsUsb,
    gvretState,
    gvretDeviceInfo,
    gvretError,
    probeGvret,
    framelinkState,
    framelinkError,
    probeFramelink,
  };
}
