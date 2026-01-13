// ui/src/apps/discovery/views/tools/SerialAnalysisResultView.tsx
// Results view for serial frame structure analysis (two phases)

import { useState } from "react";
import { useDiscoveryStore, type FramingConfig } from "../../../../stores/discoveryStore";
import type { FramingCandidate, CandidateChecksum, CandidateSourceAddress } from "../../../../utils/analysis/serialFrameAnalysis";
import { Hash, Shield, Info, CheckCircle2, AlertCircle, Check, Layers, Radio, MapPin } from "lucide-react";

export default function SerialAnalysisResultView() {
  const framingResults = useDiscoveryStore((s) => s.toolbox.serialFramingResults);
  const payloadResults = useDiscoveryStore((s) => s.toolbox.serialPayloadResults);
  const applyFrameIdMapping = useDiscoveryStore((s) => s.applyFrameIdMapping);
  const clearFrameIdMapping = useDiscoveryStore((s) => s.clearFrameIdMapping);
  const applySourceMapping = useDiscoveryStore((s) => s.applySourceMapping);
  const clearSourceMapping = useDiscoveryStore((s) => s.clearSourceMapping);
  const setFramingConfig = useDiscoveryStore((s) => s.setFramingConfig);
  const setMinFrameLength = useDiscoveryStore((s) => s.setMinFrameLength);
  const resetFraming = useDiscoveryStore((s) => s.resetFraming);
  const setSerialConfig = useDiscoveryStore((s) => s.setSerialConfig);
  const frames = useDiscoveryStore((s) => s.frames);
  const framedData = useDiscoveryStore((s) => s.framedData);

  // Track which candidate was applied (by index)
  const [appliedIdIdx, setAppliedIdIdx] = useState<number | null>(null);
  const [appliedSourceIdx, setAppliedSourceIdx] = useState<number | null>(null);
  const [appliedFramingIdx, setAppliedFramingIdx] = useState<number | null>(null);
  const [appliedChecksumIdx, setAppliedChecksumIdx] = useState<number | null>(null);

  const handleToggleId = (candidate: { startByte: number; length: number }, idx: number) => {
    if (appliedIdIdx === idx) {
      // Unset - clear the ID mapping from both config and actual frame data
      setSerialConfig({
        frame_id_start_byte: undefined,
        frame_id_bytes: undefined,
        frame_id_byte_order: undefined,
      });
      clearFrameIdMapping();
      setAppliedIdIdx(null);
    } else {
      // Apply
      const endianness = 'big'; // Default to big-endian for serial protocols
      applyFrameIdMapping({
        startByte: candidate.startByte,
        numBytes: candidate.length,
        endianness,
      });
      // Also update serialConfig so FramedDataView can pick it up
      setSerialConfig({
        frame_id_start_byte: candidate.startByte,
        frame_id_bytes: candidate.length,
        frame_id_byte_order: endianness,
      });
      setAppliedIdIdx(idx);
    }
  };

  const handleToggleSourceAddress = (candidate: CandidateSourceAddress, idx: number) => {
    if (appliedSourceIdx === idx) {
      // Unset - clear from both config and actual frame data
      setSerialConfig({
        source_address_start_byte: undefined,
        source_address_bytes: undefined,
        source_address_byte_order: undefined,
      });
      clearSourceMapping();
      setAppliedSourceIdx(null);
    } else {
      // Apply
      const endianness = 'big'; // Default to big-endian for serial protocols
      applySourceMapping({
        startByte: candidate.startByte,
        numBytes: candidate.length,
        endianness,
      });
      setSerialConfig({
        source_address_start_byte: candidate.startByte,
        source_address_bytes: candidate.length,
        source_address_byte_order: endianness,
      });
      setAppliedSourceIdx(idx);
    }
  };

  const handleToggleChecksum = (candidate: CandidateChecksum, idx: number) => {
    if (appliedChecksumIdx === idx) {
      // Unset
      setSerialConfig({
        checksum: undefined,
      });
      setAppliedChecksumIdx(null);
    } else {
      // Apply
      setSerialConfig({
        checksum: {
          algorithm: candidate.algorithm,
          start_byte: candidate.position,
          byte_length: candidate.length,
          calc_start_byte: candidate.calcStartByte,
          calc_end_byte: candidate.calcEndByte,
        },
      });
      setAppliedChecksumIdx(idx);
    }
  };

  const handleToggleFraming = (candidate: FramingCandidate, idx: number) => {
    if (appliedFramingIdx === idx) {
      // Unset - clear framing config and reset framed data
      resetFraming();
      setAppliedFramingIdx(null);
    } else {
      // Apply - set the config, SerialDiscoveryView's useEffect will call applyFraming
      // Note: minLength is now set independently via setMinFrameLength
      let config: FramingConfig;
      let suggestedMinLength = 0;

      switch (candidate.mode) {
        case 'slip':
          config = { mode: 'slip' };
          suggestedMinLength = Math.max(4, candidate.minFrameLength);
          break;
        case 'modbus_rtu':
          config = { mode: 'modbus_rtu', validateCrc: true };
          suggestedMinLength = 4;
          break;
        case 'delimiter':
          config = {
            mode: 'raw',
            delimiter: candidate.delimiterHex || '0A',
            maxLength: 1024,
          };
          suggestedMinLength = Math.max(4, candidate.minFrameLength);
          break;
      }

      setMinFrameLength(suggestedMinLength);
      setFramingConfig(config);
      setAppliedFramingIdx(idx);
    }
  };

  // Count unique frame IDs in current data
  const getUniqueIdCount = () => {
    const dataToCheck = frames.length > 0 ? frames : framedData;
    const uniqueIds = new Set(dataToCheck.map(f => f.frame_id));
    return uniqueIds.size;
  };

  if (!framingResults && !payloadResults) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
        Run Serial Analysis tools to see results
      </div>
    );
  }

  const framingResult = framingResults?.framingResult;
  const analysisResult = payloadResults?.analysisResult;

  // Framing detection results
  if (framingResult) {
    return (
      <div className="h-full overflow-y-auto p-4 pb-8 space-y-6">
        {/* Summary Header */}
        <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <Layers className="w-8 h-8 text-blue-500" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Framing Detection Results
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Analyzed {framingResult.byteCount.toLocaleString()} raw bytes
            </p>
          </div>
        </div>

        {/* General Notes */}
        {framingResult.notes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Info className="w-4 h-4" />
              <span>Summary</span>
            </div>
            <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
              {framingResult.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Framing Candidates */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Radio className="w-4 h-4" />
            <span>Detected Framing Modes</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ({appliedFramingIdx !== null ? "1 applied" : `${framingResult.candidates.length} found`})
            </span>
          </div>

          {framingResult.candidates.length === 0 ? (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                No clear framing pattern detected. Try applying framing manually in the Raw Bytes view.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {framingResult.candidates
                .filter((_, idx) => appliedFramingIdx === null || appliedFramingIdx === idx)
                .map((candidate) => {
                  const idx = framingResult.candidates.indexOf(candidate);
                  const isApplied = appliedFramingIdx === idx;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border ${
                        isApplied
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          : idx === 0 && candidate.confidence >= 70
                            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                            : candidate.confidence >= 50
                              ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                              : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-slate-900 dark:text-white uppercase">
                              {candidate.mode === 'delimiter'
                                ? `Delimiter (0x${candidate.delimiterHex})`
                                : candidate.mode.replace('_', ' ')}
                            </span>
                            {!isApplied && idx === 0 && candidate.confidence >= 70 && (
                              <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                                Best Match
                              </span>
                            )}
                            {isApplied && (
                              <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Applied
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            <span className={
                              candidate.confidence >= 70
                                ? "text-green-600 dark:text-green-400 font-medium"
                                : candidate.confidence >= 50
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : ""
                            }>
                              {candidate.confidence}% confidence
                            </span>
                            <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                            ~{candidate.estimatedFrameCount.toLocaleString()} frames
                            <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                            avg {candidate.avgFrameLength} bytes
                          </div>
                          {candidate.notes.length > 0 && (
                            <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                              {candidate.notes.join(" • ")}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => handleToggleFraming(candidate, idx)}
                            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                              isApplied
                                ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                            }`}
                          >
                            {isApplied ? "Applied" : "Apply"}
                          </button>
                          {isApplied ? (
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                          ) : candidate.confidence >= 70 ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : candidate.confidence >= 50 ? (
                            <AlertCircle className="w-5 h-5 text-yellow-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Next Steps */}
        <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Next Steps
          </h4>
          <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
            <li>Click "Apply" on a framing mode above, or configure manually in the Framing dialog</li>
            <li>Review the framed data in the "Framed Data" tab</li>
            <li>Run analysis again to identify ID bytes and checksums</li>
          </ol>
        </div>
      </div>
    );
  }

  // Payload analysis results (show below framing results if both exist)
  if (!analysisResult) {
    // Only framing results exist - already rendered above, but we got here somehow
    // This shouldn't happen with the new logic, but handle gracefully
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-4 pb-8 space-y-6">
      {/* Summary Header */}
      <div className="flex items-center gap-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Frame Structure Analysis
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Analyzed {analysisResult.frameCount.toLocaleString()} frames
            {analysisResult.hasVaryingLength
              ? ` (${analysisResult.minLength}–${analysisResult.maxLength} bytes)`
              : ` (${analysisResult.minLength} bytes)`}
          </p>
        </div>
      </div>

      {/* General Notes */}
      {analysisResult.notes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <Info className="w-4 h-4" />
            <span>Summary</span>
          </div>
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
            {analysisResult.notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Candidate ID Groups */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Hash className="w-4 h-4" />
          <span>Candidate ID Bytes</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({appliedIdIdx !== null ? "1 applied" : `${analysisResult.candidateIdGroups.length} found`})
          </span>
        </div>

        {analysisResult.candidateIdGroups.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
            No clear ID byte patterns detected
          </p>
        ) : (
          <div className="space-y-2">
            {analysisResult.candidateIdGroups
              .filter((_, idx) => appliedIdIdx === null || appliedIdIdx === idx)
              .map((candidate) => {
                const idx = analysisResult.candidateIdGroups.indexOf(candidate);
                const isApplied = appliedIdIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      isApplied
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        : idx === 0
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                            byte{candidate.length > 1 ? "s" : ""} [{candidate.startByte}
                            {candidate.length > 1 ? `:${candidate.startByte + candidate.length - 1}` : ""}]
                          </span>
                          {!isApplied && idx === 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                              Best Match
                            </span>
                          )}
                          {isApplied && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Applied ({getUniqueIdCount()} unique IDs)
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {candidate.uniqueValues.length} distinct values
                          <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                          {candidate.confidence.toFixed(0)}% confidence
                        </div>
                        {candidate.notes.length > 0 && (
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            {candidate.notes.join(" • ")}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleToggleId(candidate, idx)}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            isApplied
                              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                          }`}
                        >
                          {isApplied ? "Applied" : "Apply"}
                        </button>
                        {isApplied ? (
                          <CheckCircle2 className="w-5 h-5 text-blue-500" />
                        ) : idx === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Show sample values */}
                    {candidate.uniqueValues.length <= 20 && (
                      <div className={`mt-2 pt-2 border-t ${
                        isApplied
                          ? "border-blue-200 dark:border-blue-800"
                          : idx === 0
                            ? "border-green-200 dark:border-green-800"
                            : "border-slate-200 dark:border-slate-700"
                      }`}>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sample values:</div>
                        <div className="flex flex-wrap gap-1">
                          {candidate.uniqueValues.slice(0, 16).map((val, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 font-mono text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded"
                            >
                              0x{val.toString(16).toUpperCase().padStart(candidate.length * 2, "0")}
                            </span>
                          ))}
                          {candidate.uniqueValues.length > 16 && (
                            <span className="text-xs text-slate-400">
                              +{candidate.uniqueValues.length - 16} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Candidate Source Addresses */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <MapPin className="w-4 h-4" />
          <span>Candidate Source Addresses</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({appliedSourceIdx !== null ? "1 applied" : `${analysisResult.candidateSourceAddresses.length} found`})
          </span>
        </div>

        {analysisResult.candidateSourceAddresses.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
            No clear source address patterns detected
          </p>
        ) : (
          <div className="space-y-2">
            {analysisResult.candidateSourceAddresses
              .filter((_, idx) => appliedSourceIdx === null || appliedSourceIdx === idx)
              .map((candidate) => {
                const idx = analysisResult.candidateSourceAddresses.indexOf(candidate);
                const isApplied = appliedSourceIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      isApplied
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        : idx === 0
                          ? "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                          : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                            byte{candidate.length > 1 ? "s" : ""} [{candidate.startByte}
                            {candidate.length > 1 ? `:${candidate.startByte + candidate.length - 1}` : ""}]
                          </span>
                          {!isApplied && idx === 0 && (
                            <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded">
                              Best Match
                            </span>
                          )}
                          {isApplied && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Applied
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {candidate.uniqueValues.length} distinct addresses
                          <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                          {candidate.confidence.toFixed(0)}% confidence
                        </div>
                        {candidate.notes.length > 0 && (
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            {candidate.notes.join(" • ")}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleToggleSourceAddress(candidate, idx)}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            isApplied
                              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                          }`}
                        >
                          {isApplied ? "Applied" : "Apply"}
                        </button>
                        {isApplied ? (
                          <CheckCircle2 className="w-5 h-5 text-blue-500" />
                        ) : idx === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-purple-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Show sample values */}
                    {candidate.uniqueValues.length <= 20 && (
                      <div className={`mt-2 pt-2 border-t ${
                        isApplied
                          ? "border-blue-200 dark:border-blue-800"
                          : idx === 0
                            ? "border-purple-200 dark:border-purple-800"
                            : "border-slate-200 dark:border-slate-700"
                      }`}>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sample addresses:</div>
                        <div className="flex flex-wrap gap-1">
                          {candidate.uniqueValues.slice(0, 16).map((val, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 font-mono text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded"
                            >
                              0x{val.toString(16).toUpperCase().padStart(candidate.length * 2, "0")}
                            </span>
                          ))}
                          {candidate.uniqueValues.length > 16 && (
                            <span className="text-xs text-slate-400">
                              +{candidate.uniqueValues.length - 16} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Candidate Checksums */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Shield className="w-4 h-4" />
          <span>Candidate Checksums</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({appliedChecksumIdx !== null ? "1 applied" : `${analysisResult.candidateChecksums.length} found`})
          </span>
        </div>

        {analysisResult.candidateChecksums.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
            No checksum patterns detected
          </p>
        ) : (
          <div className="space-y-2">
            {analysisResult.candidateChecksums
              .filter((_, idx) => appliedChecksumIdx === null || appliedChecksumIdx === idx)
              .map((candidate) => {
                const idx = analysisResult.candidateChecksums.indexOf(candidate);
                const isApplied = appliedChecksumIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      isApplied
                        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                        : candidate.matchRate >= 95
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : candidate.matchRate >= 80
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                            : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                            {candidate.algorithm}
                          </span>
                          <span className="text-sm text-slate-600 dark:text-slate-400">
                            at byte {candidate.position}
                            {candidate.length > 1 ? ` (${candidate.length} bytes)` : ""}
                          </span>
                          {isApplied ? (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Applied
                            </span>
                          ) : candidate.matchRate === 100 && (
                            <span className="px-1.5 py-0.5 text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                              Perfect Match
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          <span
                            className={
                              candidate.matchRate >= 95
                                ? "text-green-600 dark:text-green-400 font-medium"
                                : candidate.matchRate >= 80
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : ""
                            }
                          >
                            {candidate.matchRate.toFixed(1)}% match rate
                          </span>
                          <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                          {candidate.matchCount.toLocaleString()} / {candidate.totalCount.toLocaleString()} frames
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                          Calculation range: bytes [{candidate.calcStartByte}:{candidate.calcEndByte})
                        </div>
                        {candidate.notes.length > 0 && (
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                            {candidate.notes.slice(0, 2).join(" • ")}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleToggleChecksum(candidate, idx)}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            isApplied
                              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/70"
                              : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                          }`}
                        >
                          {isApplied ? "Applied" : "Apply"}
                        </button>
                        {isApplied ? (
                          <CheckCircle2 className="w-5 h-5 text-blue-500" />
                        ) : candidate.matchRate >= 95 ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : candidate.matchRate >= 80 ? (
                          <AlertCircle className="w-5 h-5 text-yellow-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
