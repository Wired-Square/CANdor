// ui/src/stores/graphStore.ts

import { create } from 'zustand';
import type { FrameDetail, SignalDef } from '../types/decoder';
import type { CanProtocolConfig } from '../utils/catalogParser';
import { loadCatalog as loadCatalogFromPath } from '../utils/catalogParser';
import { buildCatalogPath } from '../utils/catalogUtils';
import type { SerialFrameConfig } from '../utils/frameExport';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

/** Type of visualisation panel */
export type PanelType = 'line-chart' | 'gauge';

/** Colour palette for signal lines */
const SIGNAL_COLOURS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

/** A signal reference (frame ID + signal name uniquely identify a signal) */
export interface SignalRef {
  frameId: number;
  signalName: string;
  unit?: string;
  colour: string;
}

/** Circular buffer for time-series data for one signal */
export interface SignalTimeSeries {
  timestamps: Float64Array;
  values: Float64Array;
  writeIndex: number;
  count: number;
  latestValue: number;
  latestTimestamp: number;
}

/** Time-series buffer capacity */
const TIMESERIES_CAPACITY = 1000;

/** A panel definition stored in the layout */
export interface GraphPanel {
  id: string;
  type: PanelType;
  title: string;
  signals: SignalRef[];
  // Gauge-specific
  minValue: number;
  maxValue: number;
}

/** react-grid-layout layout item */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Signal value entry for batch push */
export interface SignalValueEntry {
  frameId: number;
  signalName: string;
  value: number;
  timestamp: number;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function createTimeSeries(): SignalTimeSeries {
  return {
    timestamps: new Float64Array(TIMESERIES_CAPACITY),
    values: new Float64Array(TIMESERIES_CAPACITY),
    writeIndex: 0,
    count: 0,
    latestValue: 0,
    latestTimestamp: 0,
  };
}

function makeSignalKey(frameId: number, signalName: string): string {
  return `${frameId}:${signalName}`;
}

let panelCounter = 0;
function generatePanelId(): string {
  return `panel_${Date.now()}_${panelCounter++}`;
}

// ─────────────────────────────────────────
// Store
// ─────────────────────────────────────────

interface GraphState {
  // ── Catalog ──
  catalogPath: string | null;
  frames: Map<number, FrameDetail>;
  protocol: 'can' | 'serial';
  canConfig: CanProtocolConfig | null;
  serialConfig: SerialFrameConfig | null;
  /** Default byte order from catalog */
  defaultByteOrder: 'big' | 'little';
  /** Frame ID mask for catalog lookup */
  frameIdMask: number | undefined;

  // ── IO Session ──
  ioProfile: string | null;
  playbackSpeed: number;

  // ── Panels & Layout ──
  panels: GraphPanel[];
  layout: LayoutItem[];

  // ── Time-series Data ──
  seriesBuffers: Map<string, SignalTimeSeries>;
  /** Monotonically increasing version counter — panels subscribe to this to know when to re-read buffers */
  dataVersion: number;

  // ── Actions ──
  loadCatalog: (path: string) => Promise<void>;
  initFromSettings: (defaultCatalog?: string, decoderDir?: string, defaultReadProfile?: string | null) => Promise<void>;
  setIoProfile: (profile: string | null) => void;
  setPlaybackSpeed: (speed: number) => void;

  // Panel management
  addPanel: (type: PanelType) => void;
  removePanel: (panelId: string) => void;
  updatePanel: (panelId: string, updates: Partial<Pick<GraphPanel, 'title' | 'minValue' | 'maxValue'>>) => void;
  addSignalToPanel: (panelId: string, frameId: number, signalName: string, unit?: string) => void;
  removeSignalFromPanel: (panelId: string, frameId: number, signalName: string) => void;
  updateLayout: (layout: LayoutItem[]) => void;

  // Data ingestion
  pushSignalValues: (entries: SignalValueEntry[]) => void;
  clearData: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  // ── Initial state ──
  catalogPath: null,
  frames: new Map(),
  protocol: 'can',
  canConfig: null,
  serialConfig: null,
  defaultByteOrder: 'little',
  frameIdMask: undefined,

  ioProfile: null,
  playbackSpeed: 1,

  panels: [],
  layout: [],

  seriesBuffers: new Map(),
  dataVersion: 0,

  // ── Actions ──

  loadCatalog: async (path: string) => {
    try {
      const catalog = await loadCatalogFromPath(path);

      // Convert ParsedCatalog frames to FrameDetail format
      const frameMap = new Map<number, FrameDetail>();
      for (const [id, frame] of catalog.frames) {
        frameMap.set(id, {
          id,
          len: frame.length,
          isExtended: frame.isExtended,
          bus: frame.bus,
          lenMismatch: false,
          signals: frame.signals as SignalDef[],
          mux: frame.mux,
          interval: frame.interval,
        });
      }

      // Determine default byte order
      const defaultByteOrder: 'big' | 'little' =
        catalog.canConfig?.default_byte_order ??
        catalog.serialConfig?.default_byte_order ??
        'little';

      // Determine frame ID mask
      const frameIdMask = catalog.protocol === 'can'
        ? catalog.canConfig?.frame_id_mask
        : catalog.serialConfig?.frame_id_mask;

      // Convert SerialProtocolConfig to SerialFrameConfig
      let serialConfig: SerialFrameConfig | null = null;
      if (catalog.serialConfig) {
        const sc = catalog.serialConfig;
        serialConfig = {
          default_byte_order: sc.default_byte_order,
          encoding: sc.encoding,
          frame_id_start_byte: sc.frame_id_start_byte,
          frame_id_bytes: sc.frame_id_bytes,
          frame_id_byte_order: sc.frame_id_byte_order,
          frame_id_mask: sc.frame_id_mask,
          source_address_start_byte: sc.source_address_start_byte,
          source_address_bytes: sc.source_address_bytes,
          source_address_byte_order: sc.source_address_byte_order,
          min_frame_length: sc.min_frame_length,
          header_length: sc.header_length,
        };
      }

      set({
        frames: frameMap,
        catalogPath: path,
        protocol: catalog.protocol,
        canConfig: catalog.canConfig,
        serialConfig,
        defaultByteOrder,
        frameIdMask,
      });
    } catch (e) {
      console.error('Graph: Failed to load catalog', e);
    }
  },

  initFromSettings: async (defaultCatalog, decoderDir, defaultReadProfile) => {
    if (defaultReadProfile) {
      set({ ioProfile: defaultReadProfile });
    }
    if (defaultCatalog) {
      const path = buildCatalogPath(defaultCatalog, decoderDir);
      await get().loadCatalog(path);
    }
  },

  setIoProfile: (profile) => set({ ioProfile: profile }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  // ── Panel management ──

  addPanel: (type) => {
    const id = generatePanelId();
    const { panels, layout } = get();

    // Find the next available Y position
    const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

    const newPanel: GraphPanel = {
      id,
      type,
      title: type === 'line-chart' ? 'Line Chart' : 'Gauge',
      signals: [],
      minValue: 0,
      maxValue: 100,
    };

    const newLayoutItem: LayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w: type === 'line-chart' ? 6 : 3,
      h: type === 'line-chart' ? 3 : 3,
    };

    set({
      panels: [...panels, newPanel],
      layout: [...layout, newLayoutItem],
    });
  },

  removePanel: (panelId) => {
    const { panels, layout } = get();
    set({
      panels: panels.filter((p) => p.id !== panelId),
      layout: layout.filter((l) => l.i !== panelId),
    });
  },

  updatePanel: (panelId, updates) => {
    const { panels } = get();
    set({
      panels: panels.map((p) =>
        p.id === panelId ? { ...p, ...updates } : p
      ),
    });
  },

  addSignalToPanel: (panelId, frameId, signalName, unit) => {
    const { panels } = get();
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;

    // Don't add duplicates
    if (panel.signals.some((s) => s.frameId === frameId && s.signalName === signalName)) return;

    // Assign next colour from palette
    const colourIndex = panel.signals.length % SIGNAL_COLOURS.length;
    const colour = SIGNAL_COLOURS[colourIndex];

    const newSignal: SignalRef = { frameId, signalName, unit, colour };
    set({
      panels: panels.map((p) =>
        p.id === panelId ? { ...p, signals: [...p.signals, newSignal] } : p
      ),
    });
  },

  removeSignalFromPanel: (panelId, frameId, signalName) => {
    const { panels } = get();
    set({
      panels: panels.map((p) =>
        p.id === panelId
          ? { ...p, signals: p.signals.filter((s) => !(s.frameId === frameId && s.signalName === signalName)) }
          : p
      ),
    });
  },

  updateLayout: (layout) => set({ layout }),

  // ── Data ingestion ──

  pushSignalValues: (entries) => {
    const { seriesBuffers } = get();
    // Mutate in place for performance — ring buffers are never replaced, only written to
    const newBuffers = new Map(seriesBuffers);
    let created = false;

    for (const { frameId, signalName, value, timestamp } of entries) {
      const key = makeSignalKey(frameId, signalName);
      let series = newBuffers.get(key);
      if (!series) {
        series = createTimeSeries();
        newBuffers.set(key, series);
        created = true;
      }

      series.timestamps[series.writeIndex] = timestamp;
      series.values[series.writeIndex] = value;
      series.writeIndex = (series.writeIndex + 1) % TIMESERIES_CAPACITY;
      if (series.count < TIMESERIES_CAPACITY) series.count++;
      series.latestValue = value;
      series.latestTimestamp = timestamp;
    }

    // Only replace the map reference if we created new entries, otherwise
    // just bump the version to trigger re-renders via the dataVersion selector
    if (created) {
      set((state) => ({ seriesBuffers: newBuffers, dataVersion: state.dataVersion + 1 }));
    } else {
      set((state) => ({ dataVersion: state.dataVersion + 1 }));
    }
  },

  clearData: () => {
    set({ seriesBuffers: new Map(), dataVersion: 0 });
  },
}));

// ─────────────────────────────────────────
// Ring buffer read helpers (used by chart components)
// ─────────────────────────────────────────

/**
 * Extract chronologically ordered data from a ring buffer.
 * Returns [timestamps, values] arrays of length series.count.
 */
export function readTimeSeries(series: SignalTimeSeries): { timestamps: number[]; values: number[] } {
  const { count, writeIndex, timestamps, values } = series;
  const cap = timestamps.length;
  const startIdx = count < cap ? 0 : writeIndex;

  const ts = new Array<number>(count);
  const vs = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) % cap;
    ts[i] = timestamps[idx];
    vs[i] = values[idx];
  }
  return { timestamps: ts, values: vs };
}

/**
 * Build uPlot-compatible AlignedData from multiple signal ring buffers.
 * Returns [timestamps, ...seriesValues] where each is a number[].
 * Signals may have different update rates; we use the first signal's timestamps
 * as the shared x-axis and interpolate others to match.
 */
export function buildAlignedData(
  signals: SignalRef[],
  buffers: Map<string, SignalTimeSeries>,
): (number[] | null[])[] {
  if (signals.length === 0) return [[]];

  // Use first signal with data as the time base
  let baseKey: string | null = null;
  let baseSeries: SignalTimeSeries | null = null;
  for (const sig of signals) {
    const key = makeSignalKey(sig.frameId, sig.signalName);
    const s = buffers.get(key);
    if (s && s.count > 0) {
      baseKey = key;
      baseSeries = s;
      break;
    }
  }

  if (!baseSeries || !baseKey) return [[]];

  const base = readTimeSeries(baseSeries);
  const data: (number[] | null[])[] = [base.timestamps];

  for (const sig of signals) {
    const key = makeSignalKey(sig.frameId, sig.signalName);
    if (key === baseKey) {
      data.push(base.values);
    } else {
      const s = buffers.get(key);
      if (s && s.count > 0) {
        const read = readTimeSeries(s);
        data.push(read.values);
      } else {
        // No data yet for this signal
        data.push(new Array(base.timestamps.length).fill(null));
      }
    }
  }

  return data;
}
