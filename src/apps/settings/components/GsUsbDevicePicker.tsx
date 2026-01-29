// src/apps/settings/components/GsUsbDevicePicker.tsx
//
// Component for selecting a gs_usb (candleLight) device.

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { iconLg } from "../../../styles/spacing";
import {
  listGsUsbDevices,
  createDeviceId,
  formatDeviceDisplay,
  type GsUsbDeviceInfo,
} from "../../../api/gs_usb";
import { Select } from "../../../components/forms";
import { iconButtonBase } from "../../../styles/buttonStyles";
import { textDanger, spaceYSmall, helpText } from "../../../styles";

interface Props {
  /** Currently selected device ID (interface name on Linux, bus:address on Windows) */
  value: string;
  /** Called when device selection changes */
  onChange: (deviceId: string, device: GsUsbDeviceInfo | null) => void;
}

export default function GsUsbDevicePicker({ value, onChange }: Props) {
  const [devices, setDevices] = useState<GsUsbDeviceInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const available = await listGsUsbDevices();
      setDevices(available);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshDevices();
  }, []);

  const handleChange = (selectedId: string) => {
    if (!selectedId) {
      onChange("", null);
      return;
    }

    // Find the device by ID
    const device = devices.find((d) => createDeviceId(d) === selectedId);
    onChange(selectedId, device || null);
  };

  // Find currently selected device
  const selectedDevice = devices.find((d) => createDeviceId(d) === value);

  return (
    <div className={spaceYSmall}>
      <div className="flex gap-2">
        <Select
          variant="default"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1"
        >
          <option value="">Select a device...</option>
          {devices.map((device) => {
            const deviceId = createDeviceId(device);
            return (
              <option key={deviceId} value={deviceId}>
                {formatDeviceDisplay(device)}
              </option>
            );
          })}
        </Select>
        <button
          type="button"
          onClick={refreshDevices}
          disabled={isRefreshing}
          className={`${iconButtonBase} disabled:opacity-50`}
          title="Refresh device list"
        >
          <RefreshCw
            className={`${iconLg} ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {error && <p className={`text-sm ${textDanger}`}>{error}</p>}

      {devices.length === 0 && !isRefreshing && !error && (
        <p className={helpText}>
          No gs_usb devices found. Connect a CANable or other candleLight device.
        </p>
      )}

      {/* Device details when selected */}
      {selectedDevice && (
        <div className={helpText}>
          {[
            selectedDevice.serial && `S/N: ${selectedDevice.serial}`,
            `USB ${selectedDevice.bus}:${selectedDevice.address}`,
            selectedDevice.interface_name &&
              `Interface: ${selectedDevice.interface_name}`,
            selectedDevice.interface_up !== null &&
              (selectedDevice.interface_up ? "(interface up)" : "(interface down)"),
          ]
            .filter(Boolean)
            .join(" | ")}
        </div>
      )}
    </div>
  );
}
