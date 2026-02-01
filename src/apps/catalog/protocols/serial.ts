// ui/src/apps/catalog/protocols/serial.ts
// Serial/RS-485 protocol handler

import type { SerialConfig, ValidationError } from "../types";
import type { ProtocolHandler, ProtocolDefaults, ParsedFrame } from "./index";

const serialHandler: ProtocolHandler<SerialConfig> = {
  type: "serial",
  displayName: "Serial (RS-485)",
  icon: "Cable",

  parseFrame: (
    key: string,
    value: any,
    defaults: ProtocolDefaults,
    _allFrames?: Record<string, any>
  ): ParsedFrame<SerialConfig> => {
    // Interval can be inherited from catalog defaults
    let interval = value.tx?.interval ?? value.tx?.interval_ms;
    let intervalInherited = false;

    if (interval === undefined && defaults.default_interval !== undefined) {
      interval = defaults.default_interval;
      intervalInherited = true;
    }

    // NOTE: Encoding comes from [frame.serial.config], not per-frame
    // It's passed via defaults.serialEncoding for reference only

    const signals = value.signals || value.signal || [];

    return {
      base: {
        length: value.length ?? 0,
        transmitter: value.transmitter,
        interval,
        notes: value.notes,
        signals,
        mux: value.mux,
      },
      config: {
        protocol: "serial",
        frame_id: key,
        delimiter: value.delimiter,
        // encoding NOT stored here - comes from [frame.serial.config]
      },
      inherited: {
        interval: intervalInherited,
      },
    };
  },

  serializeFrame: (_key, base, config, omitInherited) => {
    const obj: Record<string, any> = {};

    // NOTE: encoding is NOT written per-frame - it's in [frame.serial.config]

    // Length
    if (base.length !== undefined && base.length > 0) {
      obj.length = base.length;
    }

    // Delimiter (for raw encoding)
    if (config.delimiter && config.delimiter.length > 0) {
      obj.delimiter = config.delimiter;
    }

    if (base.transmitter) {
      obj.transmitter = base.transmitter;
    }

    // Only include interval if not inherited
    if (base.interval !== undefined && !omitInherited?.interval) {
      obj.tx = { interval_ms: base.interval };
    }

    if (base.notes) {
      obj.notes = base.notes;
    }

    // Signals
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

    // Validate frame_id (the TOML key)
    const frameId = config.frame_id?.trim() ?? "";
    if (!frameId) {
      errors.push({ field: "frame_id", message: "Frame identifier is required" });
    } else {
      // Accept either:
      // 1. Hex values like 0xFDE0 (will be quoted in TOML)
      // 2. Plain decimal numbers (will be quoted in TOML)
      // 3. Standard identifiers (bare keys in TOML)
      const isHex = /^0x[0-9a-fA-F]+$/i.test(frameId);
      const isDec = /^\d+$/.test(frameId);
      const isIdent = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(frameId);

      if (!isHex && !isDec && !isIdent) {
        errors.push({
          field: "frame_id",
          message: 'Frame identifier must be hex like "0x123", a decimal number, or a valid identifier',
        });
      }
    }

    // Check for duplicates
    if (originalKey !== frameId && existingKeys.includes(frameId)) {
      errors.push({
        field: "frame_id",
        message: `Serial frame "${frameId}" already exists`,
      });
    }

    // NOTE: Encoding validation is at catalog level ([frame.serial.config])
    // since all serial frames share the same encoding

    // Validate delimiter (only relevant when encoding is "raw", but we validate format anyway)
    if (config.delimiter) {
      if (!Array.isArray(config.delimiter)) {
        errors.push({ field: "delimiter", message: "Delimiter must be an array of bytes" });
      } else {
        for (const byte of config.delimiter) {
          if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
            errors.push({
              field: "delimiter",
              message: "Delimiter bytes must be integers 0-255",
            });
            break;
          }
        }
      }
    }

    return errors;
  },

  getDefaultConfig: () => ({
    protocol: "serial",
    frame_id: "",
    delimiter: undefined,
    // encoding NOT here - comes from [frame.serial.config]
  }),

  getFrameDisplayId: (config) => {
    return config.frame_id || "(unnamed)";
  },

  getFrameDisplaySecondary: (_config) => {
    // Encoding info would need to come from catalog-level config
    // The caller should pass this separately if needed
    return undefined;
  },

  getFrameKey: (config) => {
    return config.frame_id || "unnamed_frame";
  },
};

export default serialHandler;
