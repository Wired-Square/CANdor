// ui/src/apps/catalog/protocols/can.ts
// CAN protocol handler

import type { CANConfig, ValidationError } from "../types";
import type { ProtocolHandler, ProtocolDefaults, ParsedFrame } from "./index";

const canHandler: ProtocolHandler<CANConfig> = {
  type: "can",
  displayName: "CAN",
  icon: "Network",

  parseFrame: (
    key: string,
    value: any,
    defaults: ProtocolDefaults,
    allFrames?: Record<string, any>
  ): ParsedFrame<CANConfig> => {
    let length = value.length;
    let lengthInherited = false;
    let transmitter = value.transmitter;
    let transmitterInherited = false;
    let interval = value.tx?.interval ?? value.tx?.interval_ms;
    let intervalInherited = false;

    const isCopy = !!value.copy;
    const copyFrom = value.copy;

    // Handle copy/inheritance from another CAN frame
    if (isCopy && copyFrom && allFrames?.[copyFrom]) {
      const sourceFrame = allFrames[copyFrom];
      if (length === undefined && sourceFrame.length !== undefined) {
        length = sourceFrame.length;
        lengthInherited = true;
      }
      if (transmitter === undefined && sourceFrame.transmitter !== undefined) {
        transmitter = sourceFrame.transmitter;
        transmitterInherited = true;
      }
      const srcInterval = sourceFrame.tx?.interval ?? sourceFrame.tx?.interval_ms;
      if (interval === undefined && srcInterval !== undefined) {
        interval = srcInterval;
        intervalInherited = true;
      }
    }

    // Inherit interval from catalog defaults
    if (interval === undefined && defaults.default_interval !== undefined) {
      interval = defaults.default_interval;
      intervalInherited = true;
    }

    const signals = value.signals || value.signal || [];
    const mux = value.mux;

    return {
      base: {
        length: length ?? 8,
        transmitter,
        interval,
        notes: value.notes,
        signals,
        mux,
      },
      config: {
        protocol: "can",
        id: key,
        extended: value.extended,
        bus: value.bus,
        copy: copyFrom,
      },
      inherited: {
        length: lengthInherited,
        transmitter: transmitterInherited,
        interval: intervalInherited,
      },
    };
  },

  serializeFrame: (_key, base, config, omitInherited) => {
    const obj: Record<string, any> = {};

    // Only include length if not inherited
    if (base.length !== undefined && !omitInherited?.length) {
      obj.length = base.length;
    }

    // Only include transmitter if not inherited
    if (base.transmitter && !omitInherited?.transmitter) {
      obj.transmitter = base.transmitter;
    }

    // Only include interval if not inherited
    if (base.interval !== undefined && !omitInherited?.interval) {
      obj.tx = { interval_ms: base.interval };
    }

    if (base.notes) {
      obj.notes = base.notes;
    }

    // CAN-specific fields
    if (config.extended) {
      obj.extended = config.extended;
    }

    if (config.bus !== undefined) {
      obj.bus = config.bus;
    }

    if (config.copy) {
      obj.copy = config.copy;
    }

    // Signals and mux are handled separately in TOML structure
    if (base.signals && base.signals.length > 0) {
      obj.signals = base.signals;
    }

    if (base.mux) {
      obj.mux = base.mux;
    }

    return obj;
  },

  validateConfig: (config, existingKeys = [], originalKey) => {
    const errors: ValidationError[] = [];
    const id = config.id?.trim() ?? "";

    if (!id) {
      errors.push({ field: "id", message: "ID is required" });
      return errors;
    }

    // Validate ID format (hex or decimal)
    const isHex = /^0x[0-9a-fA-F]+$/i.test(id);
    const isDec = /^\d+$/.test(id);

    if (!isHex && !isDec) {
      errors.push({
        field: "id",
        message: 'ID must be hex (e.g., "0x123") or decimal (e.g., "291")',
      });
    }

    // Check for valid range
    if (isHex || isDec) {
      const numericId = isHex ? parseInt(id, 16) : parseInt(id, 10);
      const maxId = config.extended ? 0x1FFFFFFF : 0x7FF;

      if (numericId < 0 || numericId > maxId) {
        errors.push({
          field: "id",
          message: config.extended
            ? "Extended ID must be 0-536870911 (0x1FFFFFFF)"
            : "Standard ID must be 0-2047 (0x7FF)",
        });
      }
    }

    // Check for duplicates (allow same key if editing)
    if (originalKey !== id && existingKeys.includes(id)) {
      errors.push({
        field: "id",
        message: `CAN frame with ID ${id} already exists`,
      });
    }

    return errors;
  },

  getDefaultConfig: () => ({
    protocol: "can",
    id: "",
    extended: false,
    bus: undefined,
    copy: undefined,
  }),

  getFrameDisplayId: (config) => config.id,

  getFrameDisplaySecondary: (config) => {
    if (!config.id) return undefined;

    // Convert hex to decimal or vice versa for secondary display
    const isHex = /^0x[0-9a-fA-F]+$/i.test(config.id);
    if (isHex) {
      const numeric = parseInt(config.id, 16);
      return isNaN(numeric) ? undefined : String(numeric);
    } else {
      const numeric = parseInt(config.id, 10);
      return isNaN(numeric) ? undefined : `0x${numeric.toString(16).toUpperCase()}`;
    }
  },

  getFrameKey: (config) => config.id,
};

export default canHandler;
