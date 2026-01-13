// ui/src/utils/analysis/index.ts
// Barrel export for analysis utilities
//
// NOTE: These modules are typically dynamically imported for code splitting.
// This barrel export is provided for convenience when static imports are acceptable.
// For optimal bundle size, prefer dynamic imports:
//   const { analyzePayloadsWithMuxDetection } = await import('../utils/analysis/payloadAnalysis');

// Checksum utilities (calculations via Rust/Tauri IPC)
export {
  type ChecksumAlgorithm,
  type ChecksumValidationResult,
  type AlgorithmInfo,
  CHECKSUM_ALGORITHMS,
  getAlgorithmInfo,
  getAlgorithmOutputBytes,
  resolveByteIndex,
  resolveByteIndexSync,
  formatByteIndex,
  calculateChecksum,
  validateChecksum,
} from './checksums';

// Mux detection utilities
export {
  type MuxDetectionResult,
  detectMuxInPayloads,
  isMuxLikeSequence,
  getMuxPayloadStartByte,
  formatMuxInfo,
  formatMuxValue,
} from './muxDetection';

// Payload analysis utilities
export {
  type ByteRole,
  type ByteStats,
  type MultiBytePattern,
  type MuxCaseAnalysis,
  type MuxInfo,
  type PayloadAnalysisResult,
  type MirrorGroup,
  type TimestampedPayload,
  analyzeBytePatterns,
  analyzePayloadsWithMuxDetection,
  addNotesToFrame,
  detectMirrorFrames,
} from './payloadAnalysis';

// Message order analysis utilities
export {
  type MessageOrderOptions,
  type DetectedPattern,
  type IntervalGroup,
  type StartIdCandidate,
  type MultiplexedFrame,
  type BurstFrame,
  type MultiBusFrame,
  type MessageOrderResult,
  analyzeMessageOrder,
} from './messageOrderAnalysis';

// Serial frame structure analysis utilities
export {
  type CandidateIdGroup,
  type CandidateSourceAddress,
  type CandidateChecksum,
  type SerialFrameAnalysisResult,
  analyzeSerialFrameStructure,
  formatChecksumCandidate,
  formatIdCandidate,
} from './serialFrameAnalysis';

// Framing detection utilities (SLIP, Modbus RTU, delimiter-based)
export {
  type FramingCandidate,
  type FramingDetectionResult,
  detectFraming,
} from './framingDetection';
