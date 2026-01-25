// ui/src/apps/discovery/views/serial/ByteExtractionDialog.tsx
//
// Dialog for configuring byte extraction from serial frames.
// Used for frame ID and source address extraction.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Dialog from '../../../../components/Dialog';
import { resolveByteIndexSync } from '../../../../utils/analysis/checksums';
import { type ExtractionConfig } from './serialTypes';
import { byteToHex } from '../../../../utils/byteUtils';

interface ByteExtractionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  sampleFrames: number[][];
  initialConfig: ExtractionConfig;
  onApply: (config: ExtractionConfig) => void;
  onClear?: () => void; // Optional clear handler to remove the config
  color: string; // 'cyan', 'purple', or 'amber'
  supportsNegativeIndex?: boolean; // Enable negative indexing (for checksum at end of frame)
}

export default function ByteExtractionDialog({
  isOpen,
  onClose,
  title,
  sampleFrames,
  initialConfig,
  onApply,
  onClear,
  color,
  supportsNegativeIndex = false,
}: ByteExtractionDialogProps) {
  const [startByte, setStartByte] = useState(initialConfig.startByte);
  const [numBytes, setNumBytes] = useState(initialConfig.numBytes);
  const [endianness, setEndianness] = useState(initialConfig.endianness);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [useNegativeIndex, setUseNegativeIndex] = useState(initialConfig.startByte < 0);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStartByte(initialConfig.startByte);
      setNumBytes(initialConfig.numBytes);
      setEndianness(initialConfig.endianness);
      setSelectionStart(null);
      setUseNegativeIndex(initialConfig.startByte < 0);
    }
  }, [isOpen, initialConfig]);

  // Get a representative frame length for negative index resolution
  const representativeLength = sampleFrames.length > 0 ? sampleFrames[0].length : 8;

  // Handle byte click for visual selection
  const handleByteClick = (byteIndex: number, frameLength: number) => {
    if (selectionStart === null) {
      // Start new selection
      setSelectionStart(byteIndex);
      if (useNegativeIndex) {
        // Convert to negative index
        setStartByte(byteIndex - frameLength);
      } else {
        setStartByte(byteIndex);
      }
      setNumBytes(1);
    } else {
      // Complete selection
      const start = Math.min(selectionStart, byteIndex);
      const end = Math.max(selectionStart, byteIndex);
      if (useNegativeIndex) {
        // Convert to negative index from end
        setStartByte(start - frameLength);
      } else {
        setStartByte(start);
      }
      setNumBytes(end - start + 1);
      setSelectionStart(null);
    }
  };

  // Check if byte is in current selection range (handles negative indices)
  const isByteSelected = (byteIndex: number, frameLength: number) => {
    const resolvedStart = resolveByteIndexSync(startByte, frameLength);
    return byteIndex >= resolvedStart && byteIndex < resolvedStart + numBytes;
  };

  // Extract value from bytes for preview (handles negative indices)
  const extractValue = (bytes: number[]): string => {
    const resolvedStart = resolveByteIndexSync(startByte, bytes.length);
    if (resolvedStart >= bytes.length) return '-';
    const endByte = Math.min(resolvedStart + numBytes, bytes.length);
    let value = 0;
    if (endianness === 'big') {
      for (let i = resolvedStart; i < endByte; i++) {
        value = (value << 8) | bytes[i];
      }
    } else {
      for (let i = resolvedStart; i < endByte; i++) {
        value |= bytes[i] << (8 * (i - resolvedStart));
      }
    }
    return `0x${value.toString(16).toUpperCase().padStart(numBytes * 2, '0')}`;
  };

  const colorClasses = color === 'cyan'
    ? { bg: 'bg-cyan-600', bgHover: 'hover:bg-cyan-500', text: 'text-cyan-400', bgLight: 'bg-cyan-900/50' }
    : color === 'purple'
    ? { bg: 'bg-purple-600', bgHover: 'hover:bg-purple-500', text: 'text-purple-400', bgLight: 'bg-purple-900/50' }
    : { bg: 'bg-amber-600', bgHover: 'hover:bg-amber-500', text: 'text-amber-400', bgLight: 'bg-amber-900/50' };

  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-2xl">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <p className="text-sm text-gray-400">
          Click bytes to select range, or enter values manually below.
        </p>

        {/* Sample frames with clickable bytes */}
        <div className="space-y-2 font-mono text-sm bg-gray-900 p-3 rounded max-h-48 overflow-y-auto">
          {sampleFrames.slice(0, 5).map((frame, frameIdx) => (
            <div key={frameIdx} className="flex items-center gap-2">
              <span className="text-gray-500 w-6 text-right">{frameIdx + 1}.</span>
              <div className="flex gap-1 flex-wrap">
                {frame.map((byte, byteIdx) => (
                  <button
                    key={byteIdx}
                    onClick={() => handleByteClick(byteIdx, frame.length)}
                    className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
                      isByteSelected(byteIdx, frame.length)
                        ? `${colorClasses.bgLight} ${colorClasses.text} ring-1 ring-current`
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                    title={useNegativeIndex ? `[${byteIdx - frame.length}]` : `[${byteIdx}]`}
                  >
                    {byteToHex(byte)}
                  </button>
                ))}
                <span className={`ml-2 ${colorClasses.text}`}>→ {extractValue(frame)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Manual controls */}
        <div className="flex items-center gap-4 pt-2 border-t border-gray-700 flex-wrap">
          {supportsNegativeIndex && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useNegativeIndex}
                onChange={(e) => {
                  setUseNegativeIndex(e.target.checked);
                  // Convert current startByte to/from negative
                  if (e.target.checked && startByte >= 0) {
                    setStartByte(startByte - representativeLength);
                  } else if (!e.target.checked && startByte < 0) {
                    setStartByte(representativeLength + startByte);
                  }
                }}
                className="rounded"
              />
              From end
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-300">
            {useNegativeIndex ? 'Offset from end:' : 'Start byte:'}
            <input
              type="number"
              value={startByte}
              onChange={(e) => setStartByte(Number(e.target.value))}
              className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-center"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Length:
            <select
              value={numBytes}
              onChange={(e) => setNumBytes(Number(e.target.value))}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value={1}>1 byte</option>
              <option value={2}>2 bytes</option>
              <option value={3}>3 bytes</option>
              <option value={4}>4 bytes</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Byte order:
            <select
              value={endianness}
              onChange={(e) => setEndianness(e.target.value as 'big' | 'little')}
              className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="big">Big Endian</option>
              <option value="little">Little Endian</option>
            </select>
          </label>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          {onClear ? (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded"
            >
              Clear
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-gray-600 hover:bg-gray-500 rounded"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              onApply({ startByte, numBytes, endianness });
              onClose();
            }}
            className={`px-4 py-2 text-sm ${colorClasses.bg} ${colorClasses.bgHover} rounded font-medium`}
          >
            Apply
          </button>
        </div>
      </div>
    </Dialog>
  );
}
