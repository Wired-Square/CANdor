// ui/src/stores/decoderStore.ts

import { create } from 'zustand';

/** Maximum number of unmatched frames to keep in buffer */
export const MAX_UNMATCHED_FRAMES = 1000;
/** Maximum number of filtered frames to keep in buffer */
export const MAX_FILTERED_FRAMES = 1000;
import { openCatalogAtPath } from '../apps/catalog/io';
import { tomlParse } from '../apps/catalog/toml';
import { saveCatalog } from '../api';
import { buildFramesToml, type SerialFrameConfig } from '../utils/frameExport';
import { formatFrameId } from '../utils/frameIds';
import { decodeSignal } from '../utils/signalDecode';
import { extractBits } from '../utils/bits';
import type { FrameDetail, SignalDef, MuxDef, MuxCaseDef } from '../types/decoder';
import { isMuxCaseKey, findMatchingMuxCase } from '../utils/muxCaseMatch';
import type { SelectionSet } from '../utils/selectionSets';
import type { CanHeaderField, HeaderFieldFormat } from '../apps/catalog/types';
import type { PlaybackSpeed } from '../components/TimeController';

// Re-export for consumers that import from decoderStore
export type { PlaybackSpeed } from '../components/TimeController';

/**
 * Normalize a signal definition from TOML, mapping byte_order to endianness.
 * This handles the transition from the old 'endianness' key to the new 'byte_order' key.
 */
function normalizeSignal(raw: any): SignalDef {
  return {
    ...raw,
    // Map byte_order to internal endianness property, fall back to endianness for backwards compatibility
    endianness: raw.byte_order ?? raw.endianness,
  };
}

/**
 * Normalize an array of signal definitions from TOML.
 */
function normalizeSignals(rawSignals: any[]): SignalDef[] {
  return rawSignals.map(normalizeSignal);
}

/**
 * Parse a raw mux object from TOML into a structured MuxDef.
 * Supports case keys as single values ("0"), ranges ("0-3"), or comma-separated ("1,2,5").
 */
function parseMux(mux: any): MuxDef | undefined {
  if (!mux || typeof mux !== 'object') return undefined;

  const startBit = mux.start_bit ?? 0;
  const bitLength = mux.bit_length ?? 8;
  const name = mux.name;
  const cases: Record<string, MuxCaseDef> = {};

  // Iterate over mux cases (keys can be "0", "0-3", "1,2,5", etc.)
  for (const [key, caseData] of Object.entries<any>(mux)) {
    // Skip reserved keys (like "name", "start_bit", "bit_length", "default")
    if (!isMuxCaseKey(key)) continue;

    // Normalize signals to map byte_order -> endianness
    const caseSignals = Array.isArray(caseData?.signals) ? normalizeSignals(caseData.signals) : [];
    const nestedMux = caseData?.mux ? parseMux(caseData.mux) : undefined;

    // Store with original key string (preserves ranges like "0-3")
    cases[key] = {
      signals: caseSignals,
      mux: nestedMux,
    };
  }

  return {
    name,
    start_bit: startBit,
    bit_length: bitLength,
    cases,
  };
}

/** Result of decoding a mux structure */
type MuxDecodeResult = {
  signals: { name: string; value: string; unit?: string; format?: string; rawValue?: number; muxValue?: number; timestamp?: number }[];
  selectors: MuxSelectorValue[];
};

/**
 * Decode signals from a mux structure based on the current frame bytes.
 * Reads the mux selector value and only decodes signals from the matching case.
 * Supports case keys as single values ("0"), ranges ("0-3"), or comma-separated ("1,2,5").
 * @param bytes - The frame payload bytes
 * @param mux - Mux definition with selector position and cases
 * @param defaultByteOrder - Catalog default byte order for signals without explicit byte_order
 * @param timestamp - Timestamp to assign to decoded signals (epoch seconds)
 */
function decodeMuxSignals(
  bytes: number[],
  mux: MuxDef,
  defaultByteOrder: 'little' | 'big' = 'little',
  timestamp?: number
): MuxDecodeResult {
  const signals: { name: string; value: string; unit?: string; format?: string; rawValue?: number; muxValue?: number; timestamp?: number }[] = [];
  const selectors: MuxSelectorValue[] = [];

  // Read the mux selector value (mux selector uses catalog default byte order)
  const selectorValue = extractBits(bytes, mux.start_bit, mux.bit_length, defaultByteOrder, false);

  // Find the matching case key (supports ranges like "0-3" and comma-separated like "1,2,5")
  const matchingCaseKey = findMatchingMuxCase(selectorValue, Object.keys(mux.cases));

  // Always record the selector value (even if no case matches)
  selectors.push({
    name: mux.name,
    value: selectorValue,
    matchedCase: matchingCaseKey,
    startBit: mux.start_bit,
    bitLength: mux.bit_length,
  });

  if (!matchingCaseKey) {
    // No matching case found
    return { signals, selectors };
  }

  const activeCase = mux.cases[matchingCaseKey];

  // Decode signals from the active case, passing default byte order
  for (const signal of activeCase.signals) {
    const decoded = decodeSignal(bytes, signal, signal.name || 'Signal', defaultByteOrder);
    signals.push({
      name: decoded.name,
      value: decoded.display,
      unit: decoded.unit,
      format: signal.format,
      rawValue: decoded.value,
      muxValue: selectorValue,
      timestamp,
    });
  }

  // Recursively decode nested mux if present
  if (activeCase.mux) {
    const nested = decodeMuxSignals(bytes, activeCase.mux, defaultByteOrder, timestamp);
    signals.push(...nested.signals);
    selectors.push(...nested.selectors);
  }

  return { signals, selectors };
}

export type DecodedSignal = {
  name: string;
  value: string;
  unit?: string;
  format?: string;
  rawValue?: number;
  /** Mux selector value this signal belongs to (undefined for non-mux signals) */
  muxValue?: number;
  /** Timestamp when this signal was last updated (epoch seconds) */
  timestamp?: number;
};

/** Extracted header field value with display formatting */
export type HeaderFieldValue = {
  name: string;
  value: number;
  display: string;
  format: HeaderFieldFormat;
};

/** Mux selector value with its definition info */
export type MuxSelectorValue = {
  /** Name of the mux (if defined) */
  name?: string;
  /** The current selector value read from the frame */
  value: number;
  /** The case key that matched (e.g., "0", "0-3", "1,2,5") */
  matchedCase?: string;
  /** Bit position of the selector */
  startBit: number;
  /** Bit length of the selector */
  bitLength: number;
};

export type DecodedFrame = {
  signals: DecodedSignal[];
  rawBytes: number[];
  /** Extracted header field values from frame ID (CAN) or frame bytes (Serial) */
  headerFields: HeaderFieldValue[];
  /** Source address extracted from frame (for per-source view mode) */
  sourceAddress?: number;
  /** Mux selector values (one per mux level, supports nested muxes) */
  muxSelectors?: MuxSelectorValue[];
};

export type FrameMetadata = {
  name: string;
  version: number;
  default_byte_order: 'little' | 'big';
  default_interval: number;
  filename: string;
};

/** CAN config from [frame.can.config] - used for frame ID masking and header field extraction */
export type CanConfig = {
  default_byte_order?: 'little' | 'big';
  default_interval?: number;
  /** Mask applied to frame_id before catalog matching (e.g., 0x1FFFFF00 for J1939) */
  frame_id_mask?: number;
  /** Header fields extracted from CAN ID (e.g., source_address, priority, pgn) */
  fields?: Record<string, CanHeaderField>;
};


/** View mode for decoded frames: single (most recent) or per-source (by source address) */
export type DecoderViewMode = 'single' | 'per-source';

/** Unmatched frame that doesn't match any frame ID in the catalog */
export type UnmatchedFrame = {
  frameId: number;
  bytes: number[];
  timestamp: number;
  sourceAddress?: number;
};

/** Filtered frame (too short or matched by ID filter) */
export type FilteredFrame = {
  frameId: number;
  bytes: number[];
  timestamp: number;
  sourceAddress?: number;
  reason: 'too_short' | 'id_filter';
};

interface DecoderState {
  // Catalog and frames
  catalogPath: string | null;
  frames: Map<number, FrameDetail>;
  selectedFrames: Set<number>;
  seenIds: Set<number>;
  /** Protocol type from catalog meta (default_frame) */
  protocol: 'can' | 'serial';
  /** CAN config from [frame.can.config] - used for frame ID masking and source address extraction */
  canConfig: CanConfig | null;
  /** Serial config from [frame.serial.config] - used for frame ID/source address extraction */
  serialConfig: SerialFrameConfig | null;

  // Decoding state
  decoded: Map<number, DecodedFrame>;
  /** Decoded frames keyed by "frameId:sourceAddress" for per-source view mode */
  decodedPerSource: Map<string, DecodedFrame>;
  /** Frames that don't match any frame ID in the catalog */
  unmatchedFrames: UnmatchedFrame[];
  /** Frames that were filtered out (e.g., too short) */
  filteredFrames: FilteredFrame[];
  ioProfile: string | null;
  showRawBytes: boolean;
  /** View mode: 'single' shows most recent per frame, 'per-source' shows by source address */
  viewMode: DecoderViewMode;
  /** Hide frames that haven't been seen (decoded) yet */
  hideUnseen: boolean;
  /** Header field filters - map of field name to set of selected values (empty = show all) */
  headerFieldFilters: Map<string, Set<number>>;
  /** Accumulated header field values seen - map of field name to map of value to {display, count} */
  seenHeaderFieldValues: Map<string, Map<number, { display: string; count: number }>>;
  /** Show ASCII gutter in unmatched/filtered tabs */
  showAsciiGutter: boolean;
  /** Frame ID filter for unmatched/filtered tabs (hex string, e.g., "0x1F3" or just "1F3") */
  frameIdFilter: string;
  /** Parsed frame ID filter as a Set of IDs (null = no filter) */
  frameIdFilterSet: Set<number> | null;

  /** Stream start time in epoch seconds (captured from first decoded signal) */
  streamStartTimeSeconds: number | null;

  // Playback control (for PostgreSQL profiles)
  playbackSpeed: PlaybackSpeed;
  currentTime: number | null;
  currentFrameIndex: number | null;

  // Time range (for PostgreSQL profiles)
  startTime: string;
  endTime: string;

  // Save dialog
  showSaveDialog: boolean;
  saveMetadata: FrameMetadata;

  // Selection set state
  activeSelectionSetId: string | null;
  selectionSetDirty: boolean;

  // Actions - Catalog
  loadCatalog: (path: string) => Promise<void>;
  initFromSettings: (defaultCatalog?: string, decoderDir?: string, defaultReadProfile?: string | null) => Promise<void>;

  // Actions - Frame management
  toggleFrameSelection: (id: number) => void;
  bulkSelectBus: (bus: number, select: boolean) => void;
  selectAllFrames: () => void;
  deselectAllFrames: () => void;
  clearFrames: () => void;
  clearDecoded: () => void;

  // Actions - Decoding
  decodeSignals: (frameId: number, bytes: number[], sourceAddress?: number) => void;
  /** Batch decode multiple frames in a single state update (for high-speed playback) */
  decodeSignalsBatch: (
    framesToDecode: Array<{ frameId: number; bytes: number[]; sourceAddress?: number }>,
    unmatchedFrames: UnmatchedFrame[],
    filteredFrames: FilteredFrame[]
  ) => void;
  addUnmatchedFrame: (frame: UnmatchedFrame) => void;
  clearUnmatchedFrames: () => void;
  addFilteredFrame: (frame: FilteredFrame) => void;
  clearFilteredFrames: () => void;
  setIoProfile: (profile: string | null) => void;
  toggleShowRawBytes: () => void;
  toggleHideUnseen: () => void;
  setViewMode: (mode: DecoderViewMode) => void;
  toggleViewMode: () => void;
  setMinFrameLength: (length: number) => void;
  toggleAsciiGutter: () => void;
  setFrameIdFilter: (filter: string) => void;

  // Actions - Header field filters
  toggleHeaderFieldFilter: (fieldName: string, value: number) => void;
  clearHeaderFieldFilter: (fieldName: string) => void;
  clearAllHeaderFieldFilters: () => void;

  // Actions - Playback control
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  updateCurrentTime: (time: number) => void;
  setCurrentFrameIndex: (index: number) => void;

  // Actions - Time range
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;

  // Actions - Save dialog
  openSaveDialog: () => void;
  closeSaveDialog: () => void;
  updateSaveMetadata: (metadata: FrameMetadata) => void;
  saveFrames: (decoderDir: string, saveFrameIdFormat: 'hex' | 'decimal') => Promise<void>;

  // Actions - Selection sets
  setActiveSelectionSet: (id: string | null) => void;
  setSelectionSetDirty: (dirty: boolean) => void;
  applySelectionSet: (selectionSet: SelectionSet) => void;
}

export const useDecoderStore = create<DecoderState>((set, get) => ({
  // Initial state
  catalogPath: null,
  frames: new Map(),
  selectedFrames: new Set(),
  seenIds: new Set(),
  protocol: 'can',
  canConfig: null,
  serialConfig: null,
  decoded: new Map(),
  decodedPerSource: new Map(),
  unmatchedFrames: [],
  filteredFrames: [],
  ioProfile: null,
  showRawBytes: false,
  viewMode: 'single',
  hideUnseen: true,
  headerFieldFilters: new Map(),
  seenHeaderFieldValues: new Map(),
  showAsciiGutter: false,
  frameIdFilter: '',
  frameIdFilterSet: null,
  streamStartTimeSeconds: null,
  playbackSpeed: 1,
  currentTime: null,
  currentFrameIndex: null,
  startTime: '',
  endTime: '',
  showSaveDialog: false,
  saveMetadata: {
    name: 'Discovered Frames',
    version: 1,
    default_byte_order: 'little',
    default_interval: 1000,
    filename: 'discovered-frames.toml',
  },
  activeSelectionSetId: null,
  selectionSetDirty: false,

  // Catalog actions
  loadCatalog: async (path: string) => {
    try {
      const content = await openCatalogAtPath(path);
      const parsed = tomlParse(content) as any;
      const frameMap = new Map<number, FrameDetail>();
      const seenIds = new Set<number>();

      // Parse CAN frames
      const canFrames = parsed?.frame?.can || {};
      Object.entries<any>(canFrames).forEach(([idKey, body]) => {
        // Skip 'config' key - it's the protocol config, not a frame
        if (idKey === 'config') return;

        // Parse frame ID: handle both "0x100" and "100" formats
        // Note: parseInt("0x100", 16) returns 0 because 'x' is invalid hex,
        // so we must strip the 0x prefix before parsing
        const cleanedKey = String(idKey).replace(/"/g, '').replace(/^0x/i, '');
        const numId = parseInt(cleanedKey, 16);
        if (!Number.isFinite(numId)) return;

        const len = body?.length ?? 0;
        const isExtended = numId > 0x7ff;

        // Parse plain signals (normalize byte_order -> endianness)
        const plainSignals = Array.isArray(body?.signals) ? normalizeSignals(body.signals) : [];

        // Parse mux structure (preserving hierarchy for proper decoding)
        const mux = body?.mux ? parseMux(body.mux) : undefined;

        frameMap.set(numId, {
          id: numId,
          len,
          isExtended,
          bus: body?.bus,
          lenMismatch: false,
          signals: plainSignals,
          mux,
        });
        seenIds.add(numId);
      });

      // Parse Serial frames
      const serialFrames = parsed?.frame?.serial || {};
      Object.entries<any>(serialFrames).forEach(([idKey, body]) => {
        // Skip 'config' key - it's the protocol config, not a frame
        if (idKey === 'config') return;

        // Parse frame ID: handle both "0x100" and "100" formats
        // Note: parseInt("0x100", 16) returns 0 because 'x' is invalid hex,
        // so we must strip the 0x prefix before parsing
        const cleanedKey = String(idKey).replace(/"/g, '').replace(/^0x/i, '');
        const numId = parseInt(cleanedKey, 16);
        if (!Number.isFinite(numId)) return;

        const len = body?.length ?? 0;

        // Parse plain signals (normalize byte_order -> endianness)
        const plainSignals = Array.isArray(body?.signals) ? normalizeSignals(body.signals) : [];

        // Parse mux structure (preserving hierarchy for proper decoding)
        const mux = body?.mux ? parseMux(body.mux) : undefined;

        frameMap.set(numId, {
          id: numId,
          len,
          isExtended: false,
          bus: body?.bus,
          lenMismatch: false,
          signals: plainSignals,
          mux,
        });
        seenIds.add(numId);
      });

      // Extract CAN config from [meta.can] (preferred) or [frame.can.config] (legacy)
      const rawCanConfig = parsed?.meta?.can || parsed?.frame?.can?.config;
      let canConfig: CanConfig | null = null;
      if (rawCanConfig && typeof rawCanConfig === 'object') {
        // Parse header fields from [frame.can.config.fields]
        let fields: Record<string, CanHeaderField> | undefined;
        if (rawCanConfig.fields && typeof rawCanConfig.fields === 'object') {
          fields = {};
          for (const [name, fieldDef] of Object.entries<any>(rawCanConfig.fields)) {
            if (!fieldDef || typeof fieldDef !== 'object') continue;
            const mask = fieldDef.mask;
            if (typeof mask !== 'number') continue;
            fields[name] = {
              mask,
              shift: typeof fieldDef.shift === 'number' ? fieldDef.shift : undefined,
              format: fieldDef.format === 'decimal' ? 'decimal' : 'hex',
            };
          }
          if (Object.keys(fields).length === 0) fields = undefined;
        }
        canConfig = {
          default_byte_order: rawCanConfig.default_byte_order,
          default_interval: rawCanConfig.default_interval,
          frame_id_mask: rawCanConfig.frame_id_mask,
          fields,
        };
      }

      // Extract serial config from [meta.serial]
      const rawSerialConfig = parsed?.meta?.serial;
      let serialConfig: SerialFrameConfig | null = null;
      if (rawSerialConfig && typeof rawSerialConfig === 'object') {
        // Parse checksum config if present
        const rawChecksum = rawSerialConfig.checksum;
        let checksumConfig: SerialFrameConfig['checksum'] = undefined;
        if (rawChecksum && typeof rawChecksum === 'object') {
          checksumConfig = {
            algorithm: rawChecksum.algorithm,
            start_byte: rawChecksum.start_byte,
            byte_length: rawChecksum.byte_length ?? 1,
            calc_start_byte: rawChecksum.calc_start_byte ?? 0,
            calc_end_byte: rawChecksum.calc_end_byte,
            big_endian: rawChecksum.big_endian ?? false,
          };
        }

        // Helper to convert mask to byte position and length
        // Mask is a bitmask over header bytes, e.g., 0xFFFF means first 2 bytes
        const maskToBytePosition = (mask: number): { startByte: number; bytes: number } | null => {
          if (!mask || mask === 0) return null;

          // Find the first and last set bit
          let firstBit = -1;
          let lastBit = -1;
          for (let i = 0; i < 32; i++) {
            if ((mask >> i) & 1) {
              if (firstBit === -1) firstBit = i;
              lastBit = i;
            }
          }

          if (firstBit === -1) return null;

          // Convert bit positions to byte positions
          const startByte = Math.floor(firstBit / 8);
          const endByte = Math.floor(lastBit / 8);
          const bytes = endByte - startByte + 1;

          return { startByte, bytes };
        };

        // Parse fields from new format [meta.serial.fields.id], [meta.serial.fields.source_address], etc.
        const fields = rawSerialConfig.fields;
        let frameIdStartByte: number | undefined;
        let frameIdBytes: number | undefined;
        let frameIdByteOrder: "big" | "little" | undefined;
        let frameIdMask: number | undefined;
        let sourceAddressStartByte: number | undefined;
        let sourceAddressBytes: number | undefined;
        let sourceAddressByteOrder: "big" | "little" | undefined;
        let headerFieldDefs: SerialFrameConfig['header_fields'] = [];

        if (fields && typeof fields === 'object') {
          // Parse all fields
          for (const [fieldName, fieldDef] of Object.entries(fields)) {
            if (!fieldDef || typeof fieldDef !== 'object' || (fieldDef as any).mask === undefined) continue;

            const fd = fieldDef as { mask: number; byte_order?: "big" | "little"; format?: "hex" | "decimal" };
            const pos = maskToBytePosition(fd.mask);
            if (!pos) continue;

            // Add to header field definitions
            headerFieldDefs.push({
              name: fieldName,
              mask: fd.mask,
              byte_order: fd.byte_order || 'big',
              format: fd.format || 'hex',
              start_byte: pos.startByte,
              bytes: pos.bytes,
            });

            // Special handling for id and source_address fields
            if (fieldName === 'id') {
              frameIdStartByte = pos.startByte;
              frameIdBytes = pos.bytes;
              frameIdByteOrder = fd.byte_order || 'big';
              frameIdMask = fd.mask;
            } else if (fieldName === 'source_address') {
              sourceAddressStartByte = pos.startByte;
              sourceAddressBytes = pos.bytes;
              sourceAddressByteOrder = fd.byte_order || 'big';
            }
          }
        }

        // Fall back to legacy format if fields not present
        serialConfig = {
          default_byte_order: rawSerialConfig.default_byte_order,
          encoding: rawSerialConfig.encoding,
          frame_id_start_byte: frameIdStartByte ?? rawSerialConfig.frame_id_start_byte,
          frame_id_bytes: frameIdBytes ?? rawSerialConfig.frame_id_bytes,
          frame_id_byte_order: frameIdByteOrder ?? rawSerialConfig.frame_id_byte_order,
          frame_id_mask: frameIdMask ?? rawSerialConfig.frame_id_mask,
          source_address_start_byte: sourceAddressStartByte ?? rawSerialConfig.source_address_start_byte,
          source_address_bytes: sourceAddressBytes ?? rawSerialConfig.source_address_bytes,
          source_address_byte_order: sourceAddressByteOrder ?? rawSerialConfig.source_address_byte_order,
          min_frame_length: rawSerialConfig.min_frame_length,
          checksum: checksumConfig,
          header_length: rawSerialConfig.header_length,
          header_fields: headerFieldDefs.length > 0 ? headerFieldDefs : undefined,
        };
      }

      // Preserve existing frame selection when reloading catalog
      // - Keep frames that still exist in the new catalog
      // - New frames are selected by default
      const { selectedFrames: currentSelected, catalogPath: currentPath } = get();
      const isReload = currentPath === path;

      let newSelected: Set<number>;
      if (isReload && currentSelected.size > 0) {
        // Reloading same catalog: preserve selection, add new frames as selected
        const existingFrameIds = new Set(frameMap.keys());
        newSelected = new Set<number>();

        // Keep currently selected frames that still exist
        for (const id of currentSelected) {
          if (existingFrameIds.has(id)) {
            newSelected.add(id);
          }
        }

        // Add new frames (frames that weren't in previous catalog) as selected
        for (const id of existingFrameIds) {
          if (!currentSelected.has(id) && !get().frames.has(id)) {
            newSelected.add(id);
          }
        }
      } else {
        // Loading a different catalog: select all frames
        newSelected = new Set(Array.from(frameMap.keys()));
      }

      // Extract protocol from [meta].default_frame, or auto-detect from frames
      const metaDefaultFrame = parsed?.meta?.default_frame;
      let protocol: 'can' | 'serial';
      if (metaDefaultFrame === 'serial' || metaDefaultFrame === 'can') {
        protocol = metaDefaultFrame;
      } else {
        // Auto-detect: if there are serial frames but no CAN frames, use serial
        const hasSerialFrames = Object.keys(serialFrames).filter(k => k !== 'config').length > 0;
        const hasCanFrames = Object.keys(canFrames).filter(k => k !== 'config').length > 0;
        protocol = hasSerialFrames && !hasCanFrames ? 'serial' : 'can';
      }

      set({
        frames: frameMap,
        selectedFrames: newSelected,
        catalogPath: path,
        seenIds,
        protocol,
        canConfig,
        serialConfig,
      });
    } catch (e) {
      console.error('Failed to load catalog', e);
    }
  },

  initFromSettings: async (defaultCatalog, decoderDir, defaultReadProfile) => {
    if (defaultReadProfile) {
      set({ ioProfile: defaultReadProfile });
    }

    if (defaultCatalog) {
      const path =
        defaultCatalog.startsWith('/') || defaultCatalog.includes('\\')
          ? defaultCatalog
          : decoderDir
          ? `${decoderDir.replace(/[\\/]+$/, '')}/${defaultCatalog}`
          : defaultCatalog;
      await get().loadCatalog(path);
    }
  },

  // Frame management actions
  toggleFrameSelection: (id) => {
    const { selectedFrames, activeSelectionSetId } = get();
    const next = new Set(selectedFrames);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({
      selectedFrames: next,
      selectionSetDirty: activeSelectionSetId !== null,
    });
  },

  bulkSelectBus: (bus, select) => {
    const { frames, selectedFrames, activeSelectionSetId } = get();
    const ids = Array.from(frames.values())
      .filter((f) => f.bus === bus)
      .map((f) => f.id);

    if (ids.length === 0) return;

    const next = new Set(selectedFrames);
    ids.forEach((id) => {
      if (select) {
        next.add(id);
      } else {
        next.delete(id);
      }
    });
    set({
      selectedFrames: next,
      selectionSetDirty: activeSelectionSetId !== null,
    });
  },

  selectAllFrames: () => {
    const { frames, activeSelectionSetId } = get();
    set({
      selectedFrames: new Set(Array.from(frames.keys())),
      selectionSetDirty: activeSelectionSetId !== null,
    });
  },

  deselectAllFrames: () => {
    const { activeSelectionSetId } = get();
    set({
      selectedFrames: new Set(),
      selectionSetDirty: activeSelectionSetId !== null,
    });
  },

  clearFrames: () => {
    // Only clear session/buffer data, NOT the catalog frames
    set({
      seenIds: new Set(),
      decoded: new Map(),
      decodedPerSource: new Map(),
      unmatchedFrames: [],
      filteredFrames: [],
      seenHeaderFieldValues: new Map(),
      headerFieldFilters: new Map(),
      streamStartTimeSeconds: null,
    });
  },

  clearDecoded: () => {
    set({
      decoded: new Map(),
      decodedPerSource: new Map(),
      unmatchedFrames: [],
      filteredFrames: [],
      seenHeaderFieldValues: new Map(),
      headerFieldFilters: new Map(),
      streamStartTimeSeconds: null,
    });
  },

  // Decoding actions
  decodeSignals: (frameId, bytes, sourceAddress) => {
    const { frames, decoded, decodedPerSource, protocol, canConfig, serialConfig } = get();

    // Apply frame_id_mask before catalog lookup
    // This allows matching on message type only (e.g., J1939 PGN without source address)
    let maskedFrameId = frameId;

    // Extract header field values from frame ID (CAN) or bytes (Serial)
    const headerFields: HeaderFieldValue[] = [];

    // For CAN, extract source address from header fields if defined
    let effectiveSourceAddress = sourceAddress;

    if (protocol === 'can' && canConfig) {
      // Apply frame_id_mask to CAN ID before matching
      if (canConfig.frame_id_mask !== undefined) {
        maskedFrameId = frameId & canConfig.frame_id_mask;
      }
      // Extract header field values from CAN ID using mask + shift
      if (canConfig.fields) {
        for (const [name, field] of Object.entries(canConfig.fields)) {
          // Calculate shift from trailing zeros in mask if not explicitly provided
          // e.g., mask 0xFFFFF00 has 8 trailing zeros, so shift = 8
          let shift = field.shift;
          if (shift === undefined && field.mask > 0) {
            shift = 0;
            let m = field.mask;
            while ((m & 1) === 0 && m > 0) {
              shift++;
              m >>>= 1;
            }
          }
          const value = (frameId & field.mask) >>> (shift ?? 0);
          const format = field.format ?? 'hex';
          const display = format === 'decimal' ? String(value) : `0x${value.toString(16).toUpperCase()}`;
          headerFields.push({ name, value, display, format });

          // Check if this field is a source address field
          // Support common naming conventions: source_address, Sender, Source, src, SA
          const lowerName = name.toLowerCase();
          if (lowerName === 'source_address' || lowerName === 'sender' || lowerName === 'source' || lowerName === 'src' || lowerName === 'sa') {
            effectiveSourceAddress = value;
          }
        }
      }
    } else if (protocol === 'serial' && serialConfig) {
      // Apply frame_id_mask to serial frame ID before matching
      if (serialConfig.frame_id_mask !== undefined) {
        maskedFrameId = frameId & serialConfig.frame_id_mask;
      }
      // Extract serial header fields from frame bytes using mask-based definitions
      if (serialConfig.header_fields && serialConfig.header_fields.length > 0) {
        for (const field of serialConfig.header_fields) {
          // Skip 'id' field - it's already shown as the frame ID
          if (field.name === 'id') continue;

          // Extract value from bytes using start_byte and bytes (computed from mask)
          if (field.start_byte < bytes.length) {
            let value = 0;
            const endByte = Math.min(field.start_byte + field.bytes, bytes.length);

            if (field.byte_order === 'little') {
              // Little endian: LSB first
              for (let i = field.start_byte; i < endByte; i++) {
                value |= bytes[i] << ((i - field.start_byte) * 8);
              }
            } else {
              // Big endian (default): MSB first
              for (let i = field.start_byte; i < endByte; i++) {
                value = (value << 8) | bytes[i];
              }
            }

            // Apply mask to extract only the relevant bits
            // The mask is relative to header_length bytes, so we need to shift it
            const shiftedMask = field.mask >>> (field.start_byte * 8);
            value = value & shiftedMask;

            const format = field.format ?? 'hex';
            const display = format === 'decimal' ? String(value) : `0x${value.toString(16).toUpperCase()}`;
            headerFields.push({ name: field.name, value, display, format });
          }
        }
      }
    }

    const frame = frames.get(maskedFrameId);
    if (!frame) return;

    // Determine default byte order from catalog config
    // CAN config takes precedence, then serial config, then fall back to 'little'
    const defaultByteOrder: 'little' | 'big' =
      (protocol === 'can' ? canConfig?.default_byte_order : serialConfig?.default_byte_order) || 'little';

    // Capture current timestamp for signals
    const now = Date.now() / 1000; // epoch seconds

    // Capture stream start time from first decoded signal
    const { streamStartTimeSeconds } = get();
    if (streamStartTimeSeconds === null) {
      set({ streamStartTimeSeconds: now });
    }

    // Decode plain signals, passing catalog default byte order
    const plainDecoded = frame.signals.map((signal, idx) => {
      const decoded = decodeSignal(bytes, signal, signal.name || `Signal ${idx + 1}`, defaultByteOrder);
      return {
        name: decoded.name,
        value: decoded.display,
        unit: decoded.unit,
        format: signal.format,
        rawValue: decoded.value,
        timestamp: now,
      };
    });

    // Decode mux signals based on active case, passing default byte order and timestamp
    const muxResult = frame.mux
      ? decodeMuxSignals(bytes, frame.mux, defaultByteOrder, now)
      : { signals: [], selectors: [] };

    // Merge new decoded values with existing ones (preserve values from other mux cases)
    const existingFrame = decoded.get(frameId);
    const existingSignals = existingFrame?.signals || [];

    // Helper to create a unique key for a signal
    // For mux signals, key by muxValue:name so each mux value's signals are tracked separately
    const signalKey = (signal: DecodedSignal) =>
      signal.muxValue !== undefined ? `${signal.muxValue}:${signal.name}` : signal.name;

    // Create a map of new values by unique key
    const newValues = new Map<string, DecodedSignal>();
    for (const signal of [...plainDecoded, ...muxResult.signals]) {
      newValues.set(signalKey(signal), signal);
    }

    // Merge: update existing signals with new values, keep old values for signals not in current frame
    const mergedSignals = new Map<string, DecodedSignal>();

    // Add all existing signals (keyed by muxValue:name for mux signals)
    for (const signal of existingSignals) {
      mergedSignals.set(signalKey(signal), signal);
    }

    // Then, update/add new signals (overwrites existing with same key)
    for (const [key, signal] of newValues) {
      mergedSignals.set(key, signal);
    }

    const decodedFrame: DecodedFrame = {
      signals: Array.from(mergedSignals.values()),
      rawBytes: bytes,
      headerFields,
      sourceAddress: effectiveSourceAddress,
      muxSelectors: muxResult.selectors.length > 0 ? muxResult.selectors : undefined,
    };

    const next = new Map(decoded);
    // Store using masked ID to match catalog frame IDs
    next.set(maskedFrameId, decodedFrame);

    // Also store in per-source map if sourceAddress is provided (from backend or extracted from CAN ID)
    const nextPerSource = new Map(decodedPerSource);
    if (effectiveSourceAddress !== undefined) {
      // Use masked ID for consistency with decoded map
      const perSourceKey = `${maskedFrameId}:${effectiveSourceAddress}`;
      nextPerSource.set(perSourceKey, decodedFrame);
    }

    // Accumulate header field values for filter options (persists across frame updates)
    const { seenHeaderFieldValues } = get();
    const nextSeenValues = new Map(seenHeaderFieldValues);
    for (const field of headerFields) {
      let fieldMap = nextSeenValues.get(field.name);
      if (!fieldMap) {
        fieldMap = new Map();
        nextSeenValues.set(field.name, fieldMap);
      }
      const existing = fieldMap.get(field.value);
      if (existing) {
        existing.count++;
      } else {
        fieldMap.set(field.value, { display: field.display, count: 1 });
      }
    }

    set({ decoded: next, decodedPerSource: nextPerSource, seenHeaderFieldValues: nextSeenValues });
  },

  decodeSignalsBatch: (framesToDecode, unmatchedToAdd, filteredToAdd) => {
    if (framesToDecode.length === 0 && unmatchedToAdd.length === 0 && filteredToAdd.length === 0) {
      return;
    }

    const { frames, decoded, decodedPerSource, protocol, canConfig, serialConfig, unmatchedFrames, filteredFrames, seenHeaderFieldValues, streamStartTimeSeconds } = get();

    // Start with current state, will mutate in place then set once at end
    const nextDecoded = new Map(decoded);
    const nextDecodedPerSource = new Map(decodedPerSource);
    const nextSeenValues = new Map(seenHeaderFieldValues);
    let newStreamStartTime = streamStartTimeSeconds;

    // Determine default byte order from catalog config
    const defaultByteOrder: 'little' | 'big' =
      (protocol === 'can' ? canConfig?.default_byte_order : serialConfig?.default_byte_order) || 'little';

    // Capture current timestamp for signals
    const now = Date.now() / 1000;

    // Set stream start time if not already set
    if (newStreamStartTime === null && framesToDecode.length > 0) {
      newStreamStartTime = now;
    }

    // Helper to create a unique key for a signal
    const signalKey = (signal: DecodedSignal) =>
      signal.muxValue !== undefined ? `${signal.muxValue}:${signal.name}` : signal.name;

    // Process all frames to decode
    for (const { frameId, bytes, sourceAddress } of framesToDecode) {
      // Apply frame_id_mask before catalog lookup
      let maskedFrameId = frameId;
      const headerFields: HeaderFieldValue[] = [];
      let effectiveSourceAddress = sourceAddress;

      if (protocol === 'can' && canConfig) {
        if (canConfig.frame_id_mask !== undefined) {
          maskedFrameId = frameId & canConfig.frame_id_mask;
        }
        if (canConfig.fields) {
          for (const [name, field] of Object.entries(canConfig.fields)) {
            let shift = field.shift;
            if (shift === undefined && field.mask > 0) {
              shift = 0;
              let m = field.mask;
              while ((m & 1) === 0 && m > 0) {
                shift++;
                m >>>= 1;
              }
            }
            const value = (frameId & field.mask) >>> (shift ?? 0);
            const format = field.format ?? 'hex';
            const display = format === 'decimal' ? String(value) : `0x${value.toString(16).toUpperCase()}`;
            headerFields.push({ name, value, display, format });

            const lowerName = name.toLowerCase();
            if (lowerName === 'source_address' || lowerName === 'sender' || lowerName === 'source' || lowerName === 'src' || lowerName === 'sa') {
              effectiveSourceAddress = value;
            }
          }
        }
      } else if (protocol === 'serial' && serialConfig) {
        if (serialConfig.frame_id_mask !== undefined) {
          maskedFrameId = frameId & serialConfig.frame_id_mask;
        }
        if (serialConfig.header_fields && serialConfig.header_fields.length > 0) {
          for (const field of serialConfig.header_fields) {
            if (field.name === 'id') continue;
            if (field.start_byte < bytes.length) {
              let value = 0;
              const endByte = Math.min(field.start_byte + field.bytes, bytes.length);
              if (field.byte_order === 'little') {
                for (let i = field.start_byte; i < endByte; i++) {
                  value |= bytes[i] << ((i - field.start_byte) * 8);
                }
              } else {
                for (let i = field.start_byte; i < endByte; i++) {
                  value = (value << 8) | bytes[i];
                }
              }
              const shiftedMask = field.mask >>> (field.start_byte * 8);
              value = value & shiftedMask;
              const format = field.format ?? 'hex';
              const display = format === 'decimal' ? String(value) : `0x${value.toString(16).toUpperCase()}`;
              headerFields.push({ name: field.name, value, display, format });
            }
          }
        }
      }

      const frame = frames.get(maskedFrameId);
      if (!frame) continue;

      // Decode plain signals
      const plainDecoded = frame.signals.map((signal, idx) => {
        const decoded = decodeSignal(bytes, signal, signal.name || `Signal ${idx + 1}`, defaultByteOrder);
        return {
          name: decoded.name,
          value: decoded.display,
          unit: decoded.unit,
          format: signal.format,
          rawValue: decoded.value,
          timestamp: now,
        };
      });

      // Decode mux signals
      const muxResult = frame.mux
        ? decodeMuxSignals(bytes, frame.mux, defaultByteOrder, now)
        : { signals: [], selectors: [] };

      // Merge with existing decoded values
      const existingFrame = nextDecoded.get(maskedFrameId);
      const existingSignals = existingFrame?.signals || [];

      const mergedSignals = new Map<string, DecodedSignal>();
      for (const signal of existingSignals) {
        mergedSignals.set(signalKey(signal), signal);
      }
      for (const signal of [...plainDecoded, ...muxResult.signals]) {
        mergedSignals.set(signalKey(signal), signal);
      }

      const decodedFrame: DecodedFrame = {
        signals: Array.from(mergedSignals.values()),
        rawBytes: bytes,
        headerFields,
        sourceAddress: effectiveSourceAddress,
        muxSelectors: muxResult.selectors.length > 0 ? muxResult.selectors : undefined,
      };

      nextDecoded.set(maskedFrameId, decodedFrame);

      if (effectiveSourceAddress !== undefined) {
        const perSourceKey = `${maskedFrameId}:${effectiveSourceAddress}`;
        nextDecodedPerSource.set(perSourceKey, decodedFrame);
      }

      // Accumulate header field values
      for (const field of headerFields) {
        let fieldMap = nextSeenValues.get(field.name);
        if (!fieldMap) {
          fieldMap = new Map();
          nextSeenValues.set(field.name, fieldMap);
        }
        const existing = fieldMap.get(field.value);
        if (existing) {
          existing.count++;
        } else {
          fieldMap.set(field.value, { display: field.display, count: 1 });
        }
      }
    }

    // Add unmatched frames (with limit)
    let nextUnmatched = unmatchedFrames;
    if (unmatchedToAdd.length > 0) {
      nextUnmatched = [...unmatchedFrames, ...unmatchedToAdd];
      if (nextUnmatched.length > MAX_UNMATCHED_FRAMES) {
        nextUnmatched = nextUnmatched.slice(-MAX_UNMATCHED_FRAMES);
      }
    }

    // Add filtered frames (with limit)
    let nextFiltered = filteredFrames;
    if (filteredToAdd.length > 0) {
      nextFiltered = [...filteredFrames, ...filteredToAdd];
      if (nextFiltered.length > MAX_FILTERED_FRAMES) {
        nextFiltered = nextFiltered.slice(-MAX_FILTERED_FRAMES);
      }
    }

    // Single state update for all changes
    set({
      decoded: nextDecoded,
      decodedPerSource: nextDecodedPerSource,
      seenHeaderFieldValues: nextSeenValues,
      streamStartTimeSeconds: newStreamStartTime,
      unmatchedFrames: nextUnmatched,
      filteredFrames: nextFiltered,
    });
  },

  addUnmatchedFrame: (frame) => {
    const { unmatchedFrames } = get();
    const newFrames = [...unmatchedFrames, frame];
    if (newFrames.length > MAX_UNMATCHED_FRAMES) {
      newFrames.splice(0, newFrames.length - MAX_UNMATCHED_FRAMES);
    }
    set({ unmatchedFrames: newFrames });
  },

  clearUnmatchedFrames: () => set({ unmatchedFrames: [] }),

  addFilteredFrame: (frame) => {
    const { filteredFrames } = get();
    const newFrames = [...filteredFrames, frame];
    if (newFrames.length > MAX_FILTERED_FRAMES) {
      newFrames.splice(0, newFrames.length - MAX_FILTERED_FRAMES);
    }
    set({ filteredFrames: newFrames });
  },

  clearFilteredFrames: () => set({ filteredFrames: [] }),

  setIoProfile: (profile) => set({ ioProfile: profile, decoded: new Map(), decodedPerSource: new Map(), unmatchedFrames: [], filteredFrames: [] }),

  toggleShowRawBytes: () => set((state) => ({ showRawBytes: !state.showRawBytes })),
  toggleHideUnseen: () => set((state) => ({ hideUnseen: !state.hideUnseen })),

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleViewMode: () => set((state) => ({
    viewMode: state.viewMode === 'single' ? 'per-source' : 'single',
  })),

  setMinFrameLength: (length) => set((state) => ({
    serialConfig: state.serialConfig
      ? { ...state.serialConfig, min_frame_length: length }
      : { min_frame_length: length },
  })),

  toggleAsciiGutter: () => set((state) => ({ showAsciiGutter: !state.showAsciiGutter })),
  setFrameIdFilter: (filter) => {
    // Parse the filter string into a Set of IDs
    // Supports: single ID (0x100), comma-separated (0x100, 0x151), ranges (0x100-0x109)
    let filterSet: Set<number> | null = null;

    if (filter.trim()) {
      const ids = new Set<number>();
      const parts = filter.split(',').map(p => p.trim()).filter(p => p.length > 0);

      for (const part of parts) {
        // Check if it's a range (e.g., "0x100-0x109" or "100-109")
        const rangeMatch = part.match(/^(0x)?([0-9a-fA-F]+)\s*-\s*(0x)?([0-9a-fA-F]+)$/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[2], 16);
          const end = parseInt(rangeMatch[4], 16);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            // Limit range to prevent excessive memory usage
            const rangeSize = max - min + 1;
            if (rangeSize <= 1000) {
              for (let i = min; i <= max; i++) {
                ids.add(i);
              }
            }
          }
        } else {
          // Single ID
          const cleaned = part.toLowerCase().replace(/^0x/, '');
          const parsed = parseInt(cleaned, 16);
          if (!isNaN(parsed)) {
            ids.add(parsed);
          }
        }
      }

      if (ids.size > 0) {
        filterSet = ids;
      }
    }

    set({ frameIdFilter: filter, frameIdFilterSet: filterSet });
  },

  // Header field filter actions
  toggleHeaderFieldFilter: (fieldName, value) => set((state) => {
    const next = new Map(state.headerFieldFilters);
    const current = next.get(fieldName) ?? new Set<number>();
    const updated = new Set(current);

    if (updated.has(value)) {
      updated.delete(value);
    } else {
      updated.add(value);
    }

    if (updated.size === 0) {
      next.delete(fieldName);
    } else {
      next.set(fieldName, updated);
    }

    return { headerFieldFilters: next };
  }),

  clearHeaderFieldFilter: (fieldName) => set((state) => {
    const next = new Map(state.headerFieldFilters);
    next.delete(fieldName);
    return { headerFieldFilters: next };
  }),

  clearAllHeaderFieldFilters: () => set({ headerFieldFilters: new Map() }),

  // Playback control actions
  setPlaybackSpeed: (speed) => {
    set({ playbackSpeed: speed });
  },

  updateCurrentTime: (time) => set({ currentTime: time }),
  setCurrentFrameIndex: (index) => set({ currentFrameIndex: index }),

  // Time range actions
  setStartTime: (time) => set({ startTime: time }),
  setEndTime: (time) => set({ endTime: time }),

  // Save dialog actions
  openSaveDialog: () => set({ showSaveDialog: true }),

  closeSaveDialog: () => set({ showSaveDialog: false }),

  updateSaveMetadata: (metadata) => set({ saveMetadata: metadata }),

  saveFrames: async (decoderDir, saveFrameIdFormat) => {
    const { selectedFrames, frames, saveMetadata } = get();

    if (!decoderDir) {
      console.error('Decoder directory is not set in settings.');
      return;
    }

    const safeFilename = saveMetadata.filename.trim() || 'discovered-frames.toml';
    const filename = safeFilename.endsWith('.toml') ? safeFilename : `${safeFilename}.toml`;
    const baseDir = decoderDir.replace(/[\\/]+$/, '');
    const path = `${baseDir}/${filename}`;

    const selectedFramesList = Array.from(frames.values())
      .filter((f) => selectedFrames.has(f.id))
      .sort((a, b) => a.id - b.id);

    const content = buildFramesToml(
      selectedFramesList,
      {
        name: saveMetadata.name,
        version: Math.max(1, saveMetadata.version),
        default_byte_order: saveMetadata.default_byte_order,
        default_frame: 'can',
        default_interval: Math.max(0, saveMetadata.default_interval),
      },
      (id, isExt) => formatFrameId(id, saveFrameIdFormat, isExt)
    );

    await saveCatalog(path, content);
    set({ showSaveDialog: false });
  },

  // Selection set actions
  setActiveSelectionSet: (id) => set({ activeSelectionSetId: id }),

  setSelectionSetDirty: (dirty) => set({ selectionSetDirty: dirty }),

  applySelectionSet: (selectionSet) => {
    // Decoder behavior: only select IDs from selectedIds
    // (including IDs that don't exist in current catalog)
    // Fall back to frameIds for backwards compatibility with old selection sets
    const idsToSelect = selectionSet.selectedIds ?? selectionSet.frameIds;
    const newSelectedFrames = new Set<number>();

    for (const frameId of idsToSelect) {
      newSelectedFrames.add(frameId);
    }

    set({
      selectedFrames: newSelectedFrames,
      activeSelectionSetId: selectionSet.id,
      selectionSetDirty: false,
    });
  },
}));
