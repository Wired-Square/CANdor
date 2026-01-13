// ui/src/apps/discovery/views/serial/ChecksumExtractionDialog.tsx
//
// Dialog for configuring checksum detection and validation.

import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import Dialog from '../../../../components/Dialog';
import { resolveByteIndexSync, type ChecksumAlgorithm } from '../../../../utils/analysis/checksums';
import {
  type ChecksumConfig,
  CHECKSUM_ALGORITHMS,
  calculateChecksum,
  getChecksumByteCount,
} from './serialTypes';
import { byteToHex } from '../../../../utils/byteUtils';

interface ChecksumExtractionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sampleFrames: number[][];
  initialConfig: ChecksumConfig | null;
  onApply: (config: ChecksumConfig) => void;
}

export default function ChecksumExtractionDialog({
  isOpen,
  onClose,
  sampleFrames,
  initialConfig,
  onApply,
}: ChecksumExtractionDialogProps) {
  const defaultConfig: ChecksumConfig = {
    startByte: -2,
    numBytes: 2,
    endianness: 'little',
    algorithm: 'crc16_modbus',
    calcStartByte: 0,
    calcEndByte: -2, // Up to but not including checksum
  };

  const [config, setConfig] = useState<ChecksumConfig>(initialConfig ?? defaultConfig);
  const [detectedAlgorithms, setDetectedAlgorithms] = useState<{ algorithm: ChecksumAlgorithm; matchCount: number }[]>([]);
  const [matchRate, setMatchRate] = useState<{ matches: number; total: number }>({ matches: 0, total: 0 });

  // Detect which algorithms match the sample frames
  const detectAlgorithms = useCallback(async () => {
    if (sampleFrames.length === 0) return;

    const results: { algorithm: ChecksumAlgorithm; matchCount: number }[] = [];

    for (const algo of CHECKSUM_ALGORITHMS) {
      if (algo.value === 'unknown') continue;

      const byteCount = getChecksumByteCount(algo.value);
      let matchCount = 0;

      for (const frame of sampleFrames.slice(0, 20)) {
        if (frame.length < byteCount + 1) continue;

        // Get checksum position (from end)
        const checksumStart = frame.length - byteCount;
        const dataEnd = checksumStart;

        // Calculate expected checksum
        const data = frame.slice(0, dataEnd);
        const expected = await calculateChecksum(algo.value, data);

        // Extract actual checksum (little-endian for CRC-16, single byte for 8-bit)
        let actual = 0;
        if (byteCount === 1) {
          actual = frame[checksumStart];
        } else {
          // Try little-endian first (more common for CRC-16)
          actual = frame[checksumStart] | (frame[checksumStart + 1] << 8);
        }

        if (expected === actual) {
          matchCount++;
        } else if (byteCount === 2) {
          // Try big-endian
          actual = (frame[checksumStart] << 8) | frame[checksumStart + 1];
          if (expected === actual) {
            matchCount++;
          }
        }
      }

      if (matchCount > 0) {
        results.push({ algorithm: algo.value, matchCount });
      }
    }

    // Sort by match count descending
    results.sort((a, b) => b.matchCount - a.matchCount);
    setDetectedAlgorithms(results);

    // Auto-select best match if found
    if (results.length > 0 && results[0].matchCount >= sampleFrames.slice(0, 20).length * 0.8) {
      const bestAlgo = results[0].algorithm;
      const byteCount = getChecksumByteCount(bestAlgo);
      setConfig(prev => ({
        ...prev,
        algorithm: bestAlgo,
        numBytes: byteCount,
        startByte: -byteCount,
        calcEndByte: -byteCount,
      }));
    }
  }, [sampleFrames]);

  // Calculate match rate for current config
  const updateMatchRate = useCallback(async () => {
    if (config.algorithm === 'unknown') {
      setMatchRate({ matches: 0, total: 0 });
      return;
    }

    let matches = 0;
    const framesToCheck = sampleFrames.slice(0, 20);

    for (const frame of framesToCheck) {
      const checksumStart = resolveByteIndexSync(config.startByte, frame.length);
      const calcEnd = resolveByteIndexSync(config.calcEndByte, frame.length);

      if (checksumStart >= frame.length || calcEnd > frame.length) continue;

      const data = frame.slice(config.calcStartByte, calcEnd);
      const expected = await calculateChecksum(config.algorithm, data);

      // Extract actual checksum
      let actual = 0;
      if (config.endianness === 'little') {
        for (let i = 0; i < config.numBytes && checksumStart + i < frame.length; i++) {
          actual |= frame[checksumStart + i] << (8 * i);
        }
      } else {
        for (let i = 0; i < config.numBytes && checksumStart + i < frame.length; i++) {
          actual = (actual << 8) | frame[checksumStart + i];
        }
      }

      if (expected === actual) matches++;
    }

    setMatchRate({ matches, total: framesToCheck.length });
  }, [config, sampleFrames]);

  // Reset state and detect algorithms when dialog opens
  useEffect(() => {
    if (isOpen) {
      setConfig(initialConfig ?? defaultConfig);
      detectAlgorithms();
    }
  }, [isOpen, initialConfig, detectAlgorithms]);

  // Update match rate when config changes
  useEffect(() => {
    if (isOpen) {
      updateMatchRate();
    }
  }, [isOpen, config, updateMatchRate]);

  const matchPercentage = matchRate.total > 0 ? (matchRate.matches / matchRate.total) * 100 : 0;

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-2xl">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Configure Checksum</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Algorithm Detection Results */}
        {detectedAlgorithms.length > 0 && (
          <div className="bg-green-900/30 border border-green-700 rounded p-3">
            <div className="text-sm text-green-400 font-medium mb-2">Detected Algorithms:</div>
            <div className="flex flex-wrap gap-2">
              {detectedAlgorithms.map(({ algorithm, matchCount }) => (
                <button
                  key={algorithm}
                  onClick={() => {
                    const byteCount = getChecksumByteCount(algorithm);
                    setConfig(prev => ({
                      ...prev,
                      algorithm,
                      numBytes: byteCount,
                      startByte: -byteCount,
                      calcEndByte: -byteCount,
                    }));
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    config.algorithm === algorithm
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {CHECKSUM_ALGORITHMS.find(a => a.value === algorithm)?.label} ({matchCount}/{Math.min(20, sampleFrames.length)})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sample frames preview */}
        <div className="space-y-2 font-mono text-sm bg-gray-900 p-3 rounded max-h-40 overflow-y-auto">
          {sampleFrames.slice(0, 5).map((frame, frameIdx) => {
            const checksumStart = resolveByteIndexSync(config.startByte, frame.length);
            const calcEnd = resolveByteIndexSync(config.calcEndByte, frame.length);

            return (
              <div key={frameIdx} className="flex items-center gap-2">
                <span className="text-gray-500 w-6 text-right">{frameIdx + 1}.</span>
                <div className="flex gap-1 flex-wrap">
                  {frame.map((byte, byteIdx) => {
                    const isChecksum = byteIdx >= checksumStart && byteIdx < checksumStart + config.numBytes;
                    const isCalcData = byteIdx >= config.calcStartByte && byteIdx < calcEnd;

                    return (
                      <span
                        key={byteIdx}
                        className={`px-1 py-0.5 rounded text-xs ${
                          isChecksum
                            ? 'bg-amber-900/50 text-amber-400 ring-1 ring-amber-500'
                            : isCalcData
                            ? 'bg-blue-900/30 text-blue-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {byteToHex(byte)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Configuration */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-700">
          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Algorithm:
            <select
              value={config.algorithm}
              onChange={(e) => {
                const algo = e.target.value as ChecksumAlgorithm;
                const byteCount = getChecksumByteCount(algo);
                setConfig(prev => ({
                  ...prev,
                  algorithm: algo,
                  numBytes: byteCount,
                  startByte: -byteCount,
                  calcEndByte: -byteCount,
                }));
              }}
              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white"
            >
              {CHECKSUM_ALGORITHMS.map(algo => (
                <option key={algo.value} value={algo.value}>{algo.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Endianness:
            <select
              value={config.endianness}
              onChange={(e) => setConfig(prev => ({ ...prev, endianness: e.target.value as 'big' | 'little' }))}
              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="little">Little Endian</option>
              <option value="big">Big Endian</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Checksum position:
            <input
              type="number"
              value={config.startByte}
              onChange={(e) => setConfig(prev => ({ ...prev, startByte: Number(e.target.value) }))}
              className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white"
            />
            <span className="text-xs text-gray-500">Negative = from end (e.g., -2)</span>
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-300">
            Calc data range:
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={config.calcStartByte}
                onChange={(e) => setConfig(prev => ({ ...prev, calcStartByte: Number(e.target.value) }))}
                className="w-16 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-center"
              />
              <span className="text-gray-500">to</span>
              <input
                type="number"
                value={config.calcEndByte}
                onChange={(e) => setConfig(prev => ({ ...prev, calcEndByte: Number(e.target.value) }))}
                className="w-16 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-center"
              />
            </div>
          </label>
        </div>

        {/* Match Rate */}
        <div className={`text-sm p-2 rounded ${
          matchPercentage >= 90 ? 'bg-green-900/30 text-green-400' :
          matchPercentage >= 50 ? 'bg-yellow-900/30 text-yellow-400' :
          'bg-red-900/30 text-red-400'
        }`}>
          Match rate: {matchRate.matches}/{matchRate.total} frames ({matchPercentage.toFixed(0)}%)
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApply(config);
              onClose();
            }}
            className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-500 rounded font-medium"
          >
            Apply
          </button>
        </div>
      </div>
    </Dialog>
  );
}
