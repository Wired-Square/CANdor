// ui/src/stores/discoveryToolboxStore.ts
//
// Toolbox state and analysis functionality for Discovery app.
// Manages analysis tools (message order, changes, serial analysis) and decoder knowledge.

import { create } from 'zustand';
import type { FrameMessage } from '../types/frame';
import type { MessageOrderResult } from '../utils/analysis/messageOrderAnalysis';
import type { PayloadAnalysisResult, MirrorGroup, TimestampedPayload } from '../utils/analysis/payloadAnalysis';
import type { SerialFrameAnalysisResult } from '../utils/analysis/serialFrameAnalysis';
import type { FramingDetectionResult } from '../utils/analysis/framingDetection';
import type {
  ChecksumDiscoveryOptions,
  ChecksumDiscoveryResult,
} from '../api/checksums';
import {
  type DecoderKnowledge,
  createEmptyKnowledge,
  initializeFrameKnowledge,
  updateKnowledgeFromMessageOrder,
  updateKnowledgeFromPayloadAnalysis,
} from '../utils/decoderKnowledge';
import type { FrameInfo } from './discoveryStore';
import { parseFrameKey, type ProtocolFrames } from '../utils/frameKey';
import { useDiscoveryUIStore } from './discoveryUIStore';
import { ANALYSIS_YIELD_MS } from '../constants';

// Toolbox types
export type ToolboxView = 'frames' | 'message-order' | 'changes' | 'serial-framing' | 'serial-payload' | 'checksum-discovery' | 'modbus-register-scan' | 'modbus-unit-scan' | 'modbus-function-codes';

/**
 * Where a checksum scan reads its payloads: a capture Rust can read itself, or
 * the frames the frontend holds when nothing has written them to one.
 */
export type ChecksumScanSource =
  | { captureId: string; selection: ProtocolFrames[] }
  | { frames: FrameMessage[] };

/** Tab ID and label for each analysis tool's output tab */
export const TOOL_TAB_CONFIG: Record<string, { tabId: string; label: string }> = {
  'message-order':        { tabId: 'tool:message-order',        label: 'Frame Order' },
  'changes':              { tabId: 'tool:changes',              label: 'Payload Changes' },
  'checksum-discovery':   { tabId: 'tool:checksum-discovery',   label: 'Checksums' },
  'serial-framing':       { tabId: 'tool:serial-framing',       label: 'Serial Framing' },
  'serial-payload':       { tabId: 'tool:serial-payload',       label: 'Serial Payload' },
  'modbus-register-scan': { tabId: 'tool:modbus-register-scan', label: 'Register Scan' },
  'modbus-unit-scan':     { tabId: 'tool:modbus-unit-scan',     label: 'Unit ID Scan' },
};

export type MessageOrderOptions = {
  startMessageId: number | null;
};

export type ChangesOptions = {
  maxExamples: number;
};

export type ChangesResult = {
  tool: 'changes';
  frameCount: number;
  uniqueFrameIds: number;
  analysisResults: PayloadAnalysisResult[];
  mirrorGroups: MirrorGroup[];
};

export type SerialFramingResult = {
  tool: 'serial-framing';
  framingResult: FramingDetectionResult;
};

export type SerialPayloadResult = {
  tool: 'serial-payload';
  analysisResult: SerialFrameAnalysisResult;
};

export type DeviceInfo = {
  vendor?: string;
  product_code?: string;
  revision?: string;
};

/**
 * A Modbus scan's identity and progress.
 *
 * Deliberately holds no frames: a scan owns a session and writes into its
 * capture like any other source, so the results arrive through the normal frame
 * path. Duplicating them here would deliver every register twice and put them
 * beyond the reach of the analysis tools and the TOML export.
 */
export type ModbusScanResults = {
  scanType: 'register' | 'unit-id';
  isScanning: boolean;
  progress: { current: number; total: number; found_count: number; pass: number; total_passes: number } | null;
  /** Device identification info keyed by unit ID (from FC43) */
  deviceInfo: Map<number, DeviceInfo>;
  /** Diagnoses from the sweep, e.g. a function code that never answered. */
  notes: string[];
  /** The scan's own session — what its progress subscription is keyed on. */
  sessionId: string | null;
  /**
   * The session that was polling the device when the sweep started, so the
   * results view can offer to put it back.
   *
   * Snapshotted rather than looked up later: once the sweep starts, the app's
   * current session is the scan's own, and the polled one is only reachable by
   * the id captured here. Rust keeps that session's source config — poll plan
   * included — so resuming it restores the polling, not merely the connection.
   */
  polledSessionId: string | null;
  polledProfileName: string | null;
};

type ModbusScanKey = 'modbusRegisterScanResults' | 'modbusUnitIdScanResults';

function resultKeyFor(scanType: 'register' | 'unit-id'): ModbusScanKey {
  return scanType === 'register' ? 'modbusRegisterScanResults' : 'modbusUnitIdScanResults';
}

export type ToolboxState = {
  isExpanded: boolean;
  activeView: ToolboxView;
  messageOrder: MessageOrderOptions;
  changes: ChangesOptions;
  checksumDiscovery: ChecksumDiscoveryOptions;
  messageOrderResults: MessageOrderResult | null;
  changesResults: ChangesResult | null;
  serialFramingResults: SerialFramingResult | null;
  serialPayloadResults: SerialPayloadResult | null;
  checksumDiscoveryResults: ChecksumDiscoveryResult | null;
  modbusRegisterScanResults: ModbusScanResults | null;
  modbusUnitIdScanResults: ModbusScanResults | null;
  isRunning: boolean;
};

interface DiscoveryToolboxState {
  // Toolbox state
  toolbox: ToolboxState;

  // Decoder knowledge
  knowledge: DecoderKnowledge;
  showInfoView: boolean;

  // Actions - Toolbox
  toggleToolboxExpanded: () => void;
  setActiveView: (view: ToolboxView) => void;
  updateMessageOrderOptions: (options: Partial<MessageOrderOptions>) => void;
  updateChangesOptions: (options: Partial<ChangesOptions>) => void;
  updateChecksumDiscoveryOptions: (options: Partial<ChecksumDiscoveryOptions>) => void;
  setIsRunning: (running: boolean) => void;
  setMessageOrderResults: (results: MessageOrderResult | null) => void;
  setChangesResults: (results: ChangesResult | null) => void;
  setSerialFramingResults: (results: SerialFramingResult | null) => void;
  setSerialPayloadResults: (results: SerialPayloadResult | null) => void;
  setChecksumDiscoveryResults: (results: ChecksumDiscoveryResult | null) => void;
  startModbusScan: (
    scanType: 'register' | 'unit-id',
    sessionId: string,
    /** The session that was polling the device, for the resume affordance. */
    polledSessionId?: string,
    polledProfileName?: string,
  ) => void;
  setModbusScanDevices: (devices: Array<{ unit_id: number; vendor?: string | null; product_code?: string | null; revision?: string | null }>) => void;
  updateModbusScanProgress: (
    progress: { current: number; total: number; found_count: number; pass: number; total_passes: number },
    notes?: string[]
  ) => void;
  finishModbusScan: (notes?: string[]) => void;
  clearAnalysisResults: () => void;
  clearToolResult: (toolTabId: string) => void;

  // Actions - Knowledge
  openInfoView: (frameInfoMap: Map<string, FrameInfo>) => void;
  closeInfoView: () => void;
  resetKnowledge: () => void;
  updateKnowledge: (knowledge: DecoderKnowledge) => void;

  // Analysis runners - these need frame data passed in
  runMessageOrderAnalysis: (
    frames: FrameMessage[],
    frameInfoMap: Map<string, FrameInfo>
  ) => Promise<MessageOrderResult>;

  runChangesAnalysis: (
    frames: FrameMessage[],
    frameInfoMap: Map<string, FrameInfo>
  ) => Promise<ChangesResult>;

  runSerialFramingAnalysis: (
    rawBytes: number[]
  ) => Promise<SerialFramingResult>;

  runSerialPayloadAnalysis: (
    frames: FrameMessage[]
  ) => Promise<SerialPayloadResult>;

  runChecksumDiscoveryAnalysis: (
    source: ChecksumScanSource
  ) => Promise<ChecksumDiscoveryResult>;
}

/**
 * Apply `fn` to whichever scan is currently running.
 *
 * Only one scan runs at a time in the UI, but which of the two result slots it
 * occupies depends on its type — so every progress update had been repeating the
 * same "check both slots, pick the scanning one, write it back" dance.
 */
function updateActiveScan(
  state: DiscoveryToolboxState,
  fn: (scan: ModbusScanResults) => ModbusScanResults
): Partial<DiscoveryToolboxState> | DiscoveryToolboxState {
  const { modbusRegisterScanResults: reg, modbusUnitIdScanResults: uid } = state.toolbox;
  const scan = reg?.isScanning ? reg : uid?.isScanning ? uid : null;
  if (!scan) return state;
  return {
    toolbox: { ...state.toolbox, [resultKeyFor(scan.scanType)]: fn(scan) },
  };
}

export const useDiscoveryToolboxStore = create<DiscoveryToolboxState>((set, get) => ({
  // Initial state
  toolbox: {
    isExpanded: false,
    activeView: 'frames',
    messageOrder: { startMessageId: null },
    changes: { maxExamples: 30 },
    checksumDiscovery: {
      minSamples: 10,
      searchCustomPolynomials: false,
      minLikeness: 50,
    },
    messageOrderResults: null,
    changesResults: null,
    serialFramingResults: null,
    serialPayloadResults: null,
    checksumDiscoveryResults: null,
    modbusRegisterScanResults: null,
    modbusUnitIdScanResults: null,
    isRunning: false,
  },
  knowledge: createEmptyKnowledge(),
  showInfoView: false,

  // Toolbox actions
  toggleToolboxExpanded: () => {
    set((state) => ({
      toolbox: { ...state.toolbox, isExpanded: !state.toolbox.isExpanded },
    }));
  },

  setActiveView: (view) => {
    set((state) => ({
      toolbox: { ...state.toolbox, activeView: view },
    }));
  },

  updateMessageOrderOptions: (options) => {
    set((state) => ({
      toolbox: { ...state.toolbox, messageOrder: { ...state.toolbox.messageOrder, ...options } },
    }));
  },

  updateChangesOptions: (options) => {
    set((state) => ({
      toolbox: { ...state.toolbox, changes: { ...state.toolbox.changes, ...options } },
    }));
  },

  updateChecksumDiscoveryOptions: (options) => {
    set((state) => ({
      toolbox: { ...state.toolbox, checksumDiscovery: { ...state.toolbox.checksumDiscovery, ...options } },
    }));
  },

  setIsRunning: (running) => {
    set((state) => ({
      toolbox: { ...state.toolbox, isRunning: running },
    }));
  },

  setMessageOrderResults: (results) => {
    set((state) => ({
      toolbox: { ...state.toolbox, messageOrderResults: results },
    }));
  },

  setChangesResults: (results) => {
    set((state) => ({
      toolbox: { ...state.toolbox, changesResults: results },
    }));
  },

  setSerialFramingResults: (results) => {
    set((state) => ({
      toolbox: { ...state.toolbox, serialFramingResults: results },
    }));
  },

  setSerialPayloadResults: (results) => {
    set((state) => ({
      toolbox: { ...state.toolbox, serialPayloadResults: results },
    }));
  },

  setChecksumDiscoveryResults: (results) => {
    set((state) => ({
      toolbox: { ...state.toolbox, checksumDiscoveryResults: results },
    }));
  },

  startModbusScan: (scanType, sessionId, polledSessionId, polledProfileName) => {
    const tabKey = scanType === 'register' ? 'modbus-register-scan' : 'modbus-unit-scan';
    set((state) => ({
      toolbox: {
        ...state.toolbox,
        [resultKeyFor(scanType)]: {
          scanType,
          isScanning: true,
          progress: null,
          deviceInfo: new Map(),
          notes: [],
          sessionId,
          polledSessionId: polledSessionId ?? null,
          polledProfileName: polledProfileName ?? null,
        },
      },
    }));
    useDiscoveryUIStore.getState().setFramesViewActiveTab(TOOL_TAB_CONFIG[tabKey].tabId);
  },

  // The backend republishes its whole device list on every progress tick, so
  // replace the map in one update rather than folding in an entry at a time —
  // the latter cost a store notification and a full Map copy per device, per tick.
  setModbusScanDevices: (devices) => {
    set((state) => {
      // Device identification only comes from unit ID scans.
      const scan = state.toolbox.modbusUnitIdScanResults;
      if (!scan || devices.length === scan.deviceInfo.size) return state;
      const deviceInfo = new Map(
        devices.map((d) => [
          d.unit_id,
          {
            vendor: d.vendor ?? undefined,
            product_code: d.product_code ?? undefined,
            revision: d.revision ?? undefined,
          },
        ])
      );
      return {
        toolbox: { ...state.toolbox, modbusUnitIdScanResults: { ...scan, deviceInfo } },
      };
    });
  },

  updateModbusScanProgress: (progress, notes) => {
    set((state) =>
      updateActiveScan(state, (scan) => ({ ...scan, progress, notes: notes ?? scan.notes }))
    );
  },

  finishModbusScan: (notes) => {
    set((state) =>
      updateActiveScan(state, (scan) => ({
        ...scan,
        isScanning: false,
        notes: notes ?? scan.notes,
        sessionId: null,
      }))
    );
  },

  clearAnalysisResults: () => {
    set((state) => ({
      toolbox: {
        ...state.toolbox,
        messageOrderResults: null,
        changesResults: null,
        serialFramingResults: null,
        serialPayloadResults: null,
        checksumDiscoveryResults: null,
        modbusRegisterScanResults: null,
        modbusUnitIdScanResults: null,
      },
    }));
  },

  clearToolResult: (toolTabId) => {
    set((state) => {
      const toolbox = { ...state.toolbox };
      switch (toolTabId) {
        case TOOL_TAB_CONFIG['message-order'].tabId:
          toolbox.messageOrderResults = null;
          break;
        case TOOL_TAB_CONFIG['changes'].tabId:
          toolbox.changesResults = null;
          break;
        case TOOL_TAB_CONFIG['checksum-discovery'].tabId:
          toolbox.checksumDiscoveryResults = null;
          break;
        case TOOL_TAB_CONFIG['serial-framing'].tabId:
          toolbox.serialFramingResults = null;
          break;
        case TOOL_TAB_CONFIG['serial-payload'].tabId:
          toolbox.serialPayloadResults = null;
          break;
        case TOOL_TAB_CONFIG['modbus-register-scan'].tabId:
          toolbox.modbusRegisterScanResults = null;
          break;
        case TOOL_TAB_CONFIG['modbus-unit-scan'].tabId:
          toolbox.modbusUnitIdScanResults = null;
          break;
      }
      return { toolbox };
    });
  },

  // Knowledge actions
  openInfoView: (frameInfoMap) => {
    const { knowledge } = get();
    if (knowledge.frames.size === 0 && frameInfoMap.size > 0) {
      // Detect predominant protocol from frames
      let serialCount = 0;
      let canCount = 0;
      for (const info of frameInfoMap.values()) {
        if (info.protocol === 'serial') {
          serialCount++;
        } else {
          canCount++;
        }
      }
      const detectedProtocol: 'can' | 'serial' = serialCount > canCount ? 'serial' : 'can';

      const newKnowledge = createEmptyKnowledge(detectedProtocol);
      for (const [fk, info] of frameInfoMap) {
        const { frameId } = parseFrameKey(fk);
        newKnowledge.frames.set(
          frameId,
          initializeFrameKnowledge(frameId, info.len, info.isExtended, info.bus)
        );
      }
      set({ knowledge: newKnowledge, showInfoView: true });
    } else {
      set({ showInfoView: true });
    }
  },

  closeInfoView: () => set({ showInfoView: false }),

  resetKnowledge: () => set({ knowledge: createEmptyKnowledge() }),

  updateKnowledge: (knowledge) => set({ knowledge }),

  // Analysis runners
  runMessageOrderAnalysis: async (frames, frameInfoMap) => {
    const { toolbox, knowledge } = get();

    set((state) => ({ toolbox: { ...state.toolbox, isRunning: true } }));

    // Allow React to render
    await new Promise(resolve => setTimeout(resolve, ANALYSIS_YIELD_MS));

    // Lazy load analysis module
    const { analyzeMessageOrder } = await import('../utils/analysis/messageOrderAnalysis');
    const messageOrderResults = analyzeMessageOrder(frames, toolbox.messageOrder) as MessageOrderResult;

    // Update knowledge with message order analysis results
    let updatedKnowledge = knowledge;
    if (updatedKnowledge.frames.size === 0) {
      for (const [fk, info] of frameInfoMap) {
        const { frameId } = parseFrameKey(fk);
        updatedKnowledge.frames.set(
          frameId,
          initializeFrameKnowledge(frameId, info.len, info.isExtended, info.bus)
        );
      }
    }

    updatedKnowledge = updateKnowledgeFromMessageOrder(updatedKnowledge, {
      intervalGroups: messageOrderResults.intervalGroups,
      multiplexedFrames: messageOrderResults.multiplexedFrames,
      burstFrames: messageOrderResults.burstFrames,
      multiBusFrames: messageOrderResults.multiBusFrames,
    });

    set((state) => ({
      knowledge: updatedKnowledge,
      toolbox: {
        ...state.toolbox,
        isRunning: false,
        messageOrderResults,
      },
    }));

    // Switch to tool-specific tab to show results
    useDiscoveryUIStore.getState().setFramesViewActiveTab(TOOL_TAB_CONFIG['message-order'].tabId);

    return messageOrderResults;
  },

  runChangesAnalysis: async (frames, frameInfoMap) => {
    const { knowledge } = get();

    set((state) => ({ toolbox: { ...state.toolbox, isRunning: true } }));

    await new Promise(resolve => setTimeout(resolve, ANALYSIS_YIELD_MS));

    const { analyzePayloadsWithMuxDetection, detectMirrorFrames } = await import('../utils/analysis/payloadAnalysis');

    // Group frames by frame ID
    const framesByIdMap = new Map<number, number[][]>();
    const timestampedByIdMap = new Map<number, TimestampedPayload[]>();

    for (const f of frames) {
      if (!framesByIdMap.has(f.frame_id)) {
        framesByIdMap.set(f.frame_id, []);
        timestampedByIdMap.set(f.frame_id, []);
      }
      framesByIdMap.get(f.frame_id)!.push(f.bytes);
      timestampedByIdMap.get(f.frame_id)!.push({
        timestamp: f.timestamp_us,
        payload: f.bytes,
      });
    }

    // Analyze each frame ID
    const analysisResults: PayloadAnalysisResult[] = [];
    for (const [frameId, payloads] of framesByIdMap) {
      const frameKnowledge = knowledge.frames.get(frameId);
      const isBurstFrame = frameKnowledge?.isBurst ?? false;
      const result = analyzePayloadsWithMuxDetection(payloads, frameId, isBurstFrame);
      analysisResults.push(result);
    }

    const mirrorGroups = detectMirrorFrames(timestampedByIdMap);

    const changesResults: ChangesResult = {
      tool: 'changes',
      frameCount: frames.length,
      uniqueFrameIds: framesByIdMap.size,
      analysisResults,
      mirrorGroups,
    };

    // Update knowledge
    let updatedKnowledge = knowledge;
    if (updatedKnowledge.frames.size === 0) {
      for (const [fk, info] of frameInfoMap) {
        const { frameId } = parseFrameKey(fk);
        updatedKnowledge.frames.set(
          frameId,
          initializeFrameKnowledge(frameId, info.len, info.isExtended, info.bus)
        );
      }
    }

    updatedKnowledge = updateKnowledgeFromPayloadAnalysis(
      updatedKnowledge,
      analysisResults.map((r) => ({
        frameId: r.frameId,
        notes: r.notes,
        muxInfo: r.muxInfo,
        multiBytePatterns: r.multiBytePatterns,
        muxCaseAnalyses: r.muxCaseAnalyses,
        inferredEndianness: r.inferredEndianness,
      }))
    );

    set((state) => ({
      knowledge: updatedKnowledge,
      toolbox: {
        ...state.toolbox,
        isRunning: false,
        changesResults,
      },
    }));

    // Switch to tool-specific tab to show results
    useDiscoveryUIStore.getState().setFramesViewActiveTab(TOOL_TAB_CONFIG['changes'].tabId);

    return changesResults;
  },

  runSerialFramingAnalysis: async (rawBytes) => {
    set((state) => ({ toolbox: { ...state.toolbox, isRunning: true } }));

    await new Promise(resolve => setTimeout(resolve, ANALYSIS_YIELD_MS));

    const { detectFraming } = await import('../utils/analysis/framingDetection');

    const framingResult = detectFraming([...rawBytes]);
    const serialFramingResults: SerialFramingResult = {
      tool: 'serial-framing',
      framingResult,
    };

    set((state) => ({
      toolbox: {
        ...state.toolbox,
        isRunning: false,
        serialFramingResults,
      },
    }));

    return serialFramingResults;
  },

  runSerialPayloadAnalysis: async (frames) => {
    set((state) => ({ toolbox: { ...state.toolbox, isRunning: true } }));

    await new Promise(resolve => setTimeout(resolve, ANALYSIS_YIELD_MS));

    const { analyzeSerialFrameStructure } = await import('../utils/analysis/serialFrameAnalysis');

    const allPayloads = frames.map(f => f.bytes);
    const analysisResult = await analyzeSerialFrameStructure(allPayloads);

    const serialPayloadResults: SerialPayloadResult = {
      tool: 'serial-payload',
      analysisResult,
    };

    set((state) => ({
      toolbox: {
        ...state.toolbox,
        isRunning: false,
        serialPayloadResults,
      },
    }));

    return serialPayloadResults;
  },

  runChecksumDiscoveryAnalysis: async (source) => {
    const { toolbox } = get();

    set((state) => ({ toolbox: { ...state.toolbox, isRunning: true } }));

    // Allow React to render
    await new Promise(resolve => setTimeout(resolve, ANALYSIS_YIELD_MS));

    // One IPC call for the whole scan — reading, grouping, sampling, sweeping
    // and solving all happen in Rust.
    const { discoverChecksums, discoverChecksumsInCapture } = await import('../api/checksums');

    const checksumDiscoveryResults =
      'captureId' in source
        ? await discoverChecksumsInCapture(
            source.captureId,
            source.selection,
            toolbox.checksumDiscovery
          )
        : await discoverChecksums(source.frames, toolbox.checksumDiscovery);

    set((state) => ({
      toolbox: {
        ...state.toolbox,
        isRunning: false,
        checksumDiscoveryResults,
      },
    }));

    // Switch to tool-specific tab to show results
    useDiscoveryUIStore.getState().setFramesViewActiveTab(TOOL_TAB_CONFIG['checksum-discovery'].tabId);

    return checksumDiscoveryResults;
  },
}));
