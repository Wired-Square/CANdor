// ui/src/dialogs/io-reader-picker/BufferList.tsx

import { Check, FileText, Trash2, Radio, Plug } from "lucide-react";
import { iconMd, iconSm } from "../../styles/spacing";
import { sectionHeader, caption, textMedium } from "../../styles/typography";
import { borderDivider, bgSurface } from "../../styles";
import type { BufferMetadata } from "../../api/buffer";

type Props = {
  buffers: BufferMetadata[];
  selectedBufferId: string | null;
  checkedReaderId: string | null;
  /** Reader IDs selected in multi-bus mode */
  checkedReaderIds?: string[];
  onSelectBuffer: (bufferId: string) => void;
  onDeleteBuffer: (bufferId: string) => void;
  onClearAllBuffers: () => void;
  /** Called when user wants to join a streaming session (passes buffer ID) */
  onJoinStreamingBuffer?: (bufferId: string) => void;
};

export default function BufferList({
  buffers,
  selectedBufferId,
  checkedReaderId,
  checkedReaderIds = [],
  onSelectBuffer,
  onDeleteBuffer,
  onClearAllBuffers,
  onJoinStreamingBuffer,
}: Props) {
  if (buffers.length === 0) {
    return null;
  }

  // Check if any buffer can be deleted (not streaming)
  const hasNonStreamingBuffers = buffers.some(b => !b.is_streaming);

  return (
    <div className={borderDivider}>
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
        <span className={sectionHeader}>
          Buffers ({buffers.length})
        </span>
        {buffers.length > 1 && hasNonStreamingBuffers && (
          <button
            onClick={onClearAllBuffers}
            className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          >
            Clear All
          </button>
        )}
      </div>
      <div className="p-3 space-y-2">
        {buffers.map((buffer) => {
          const isThisBufferSelected = selectedBufferId === buffer.id && !checkedReaderId && checkedReaderIds.length === 0;
          const isStreaming = buffer.is_streaming;
          return (
            <div
              key={buffer.id}
              onClick={() => onSelectBuffer(buffer.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSelectBuffer(buffer.id)}
              className={`w-full px-3 py-2 flex items-center gap-3 text-left rounded-lg transition-colors cursor-pointer ${
                isThisBufferSelected
                  ? "bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
                  : isStreaming
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700"
                  : `${bgSurface} border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600`
              }`}
            >
              {isStreaming ? (
                <Radio className={`${iconMd} flex-shrink-0 text-green-600 dark:text-green-400 animate-pulse`} />
              ) : (
                <FileText
                  className={`${iconMd} flex-shrink-0 ${
                    buffer.buffer_type === "bytes"
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-blue-600 dark:text-blue-400"
                  }`}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className={`${textMedium} truncate`}>
                  {buffer.buffer_type === "bytes" ? "Bytes" : "Frames"}: {buffer.name}
                </div>
                <div className={`${caption} flex items-center gap-2`}>
                  {isStreaming && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 font-medium">
                      Live
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700">
                    {buffer.id}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    isStreaming
                      ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                      : "bg-slate-100 dark:bg-slate-700"
                  }`}>
                    {buffer.count.toLocaleString()} {buffer.buffer_type}
                  </span>
                </div>
              </div>
              {isThisBufferSelected && (
                <Check className={`${iconMd} text-blue-600 dark:text-blue-400 flex-shrink-0`} />
              )}
              {isStreaming && onJoinStreamingBuffer ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJoinStreamingBuffer(buffer.id);
                  }}
                  className="p-1 rounded transition-colors hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                  title="Join streaming session"
                >
                  <Plug className={iconSm} />
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isStreaming) {
                      onDeleteBuffer(buffer.id);
                    }
                  }}
                  disabled={isStreaming}
                  className={`p-1 rounded transition-colors ${
                    isStreaming
                      ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                      : "hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  }`}
                  title={isStreaming ? "Cannot delete streaming buffer" : "Delete buffer"}
                >
                  <Trash2 className={iconSm} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
