// ui/src/dialogs/DecoderInfoDialog.tsx

import { X, FileText, Shuffle, Zap, GitBranch, Clock, Layers } from "lucide-react";
import Dialog from "../components/Dialog";
import { useDiscoveryStore } from "../stores/discoveryStore";
import type { DecoderKnowledge, FrameKnowledge, MuxKnowledge } from "../utils/decoderKnowledge";
import { createDefaultSignalsForFrame } from "../utils/decoderKnowledge";
import { formatFrameId } from "../utils/frameIds";
import { formatMs } from "../utils/reportExport";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function DecoderInfoDialog({ isOpen, onClose }: Props) {
  const knowledge = useDiscoveryStore((s) => s.knowledge);

  const frameCount = knowledge.frames.size;
  const muxCount = knowledge.multiplexedFrames.length;
  const burstCount = knowledge.burstFrames.length;
  const multiBusCount = knowledge.multiBusFrames.length;

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-2xl">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Decoder Knowledge
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Accumulated information about discovered frames
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto space-y-6">
          {/* Meta Section */}
          <MetaSection knowledge={knowledge} />

          {/* Stats Summary */}
          <div className="flex flex-wrap gap-4 text-xs p-3 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <span className="text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200">{frameCount}</span> frames
            </span>
            {muxCount > 0 && (
              <span className="text-orange-500 dark:text-orange-400">
                <span className="font-medium">{muxCount}</span> mux
              </span>
            )}
            {burstCount > 0 && (
              <span className="text-cyan-500 dark:text-cyan-400">
                <span className="font-medium">{burstCount}</span> burst
              </span>
            )}
            {multiBusCount > 0 && (
              <span className="text-rose-500 dark:text-rose-400">
                <span className="font-medium">{multiBusCount}</span> multi-bus
              </span>
            )}
            {knowledge.analysisRun && (
              <span className="text-green-500 dark:text-green-400 ml-auto">
                ✓ Analysis run
              </span>
            )}
            {!knowledge.analysisRun && (
              <span className="text-amber-500 dark:text-amber-400 ml-auto">
                Run analysis for more info
              </span>
            )}
          </div>

          {/* Frames Section */}
          <FramesSection knowledge={knowledge} />
        </div>
      </div>
    </Dialog>
  );
}

// ============================================================================
// Meta Section
// ============================================================================

type MetaSectionProps = {
  knowledge: DecoderKnowledge;
};

function MetaSection({ knowledge }: MetaSectionProps) {
  const { meta } = knowledge;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-purple-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Meta (for [meta] section)
        </h3>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">default_frame</span>
          <span className="font-mono text-slate-700 dark:text-slate-200">"{meta.defaultFrame}"</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">default_endianness</span>
          <span className="font-mono text-slate-700 dark:text-slate-200">"{meta.defaultEndianness}"</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">default_interval</span>
          {meta.defaultInterval !== null ? (
            <span className="font-mono text-emerald-600 dark:text-emerald-400">{meta.defaultInterval}</span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 italic">not determined</span>
          )}
        </div>
        {meta.defaultInterval !== null && (
          <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-1">
            Based on largest repetition period group ({knowledge.intervalGroups.find(g => g.intervalMs === meta.defaultInterval)?.frameIds.length ?? 0} frames)
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Frames Section
// ============================================================================

type FramesSectionProps = {
  knowledge: DecoderKnowledge;
};

function FramesSection({ knowledge }: FramesSectionProps) {
  const frames = Array.from(knowledge.frames.values()).sort((a, b) => a.frameId - b.frameId);

  if (frames.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Frames
          </h3>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No frames discovered yet.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-emerald-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Frames ({frames.length})
        </h3>
      </div>
      <div className="space-y-2">
        {frames.map((frame) => (
          <FrameCard key={frame.frameId} frame={frame} />
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// Frame Card
// ============================================================================

type FrameCardProps = {
  frame: FrameKnowledge;
};

function FrameCard({ frame }: FrameCardProps) {
  const defaultSignals = createDefaultSignalsForFrame(frame.length, frame.mux, frame.signals);
  const allSignals = [...frame.signals, ...defaultSignals];

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-sm text-slate-700 dark:text-slate-200">
            {formatFrameId(frame.frameId)}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {frame.length} bytes
          </span>
          {frame.isExtended && (
            <span className="px-1 py-0.5 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
              EXT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {frame.intervalMs !== undefined && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">
              {formatMs(frame.intervalMs)}
            </span>
          )}
          {frame.bus !== undefined && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Bus {frame.bus}
            </span>
          )}
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {frame.mux && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
            <Shuffle className="w-3 h-3" />
            {frame.mux.isTwoByte ? "2D Mux" : "Mux"}
          </span>
        )}
        {frame.isBurst && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded">
            <Zap className="w-3 h-3" />
            Burst
          </span>
        )}
        {frame.isMultiBus && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded">
            <GitBranch className="w-3 h-3" />
            Multi-bus
          </span>
        )}
      </div>

      {/* Mux Details */}
      {frame.mux && <MuxDetails mux={frame.mux} />}

      {/* Burst Details */}
      {frame.burstInfo && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
          Burst: ~{frame.burstInfo.burstCount} frames, {formatMs(frame.burstInfo.burstPeriodMs)} cycle
          {frame.burstInfo.flags.length > 0 && (
            <span className="ml-1 text-cyan-600 dark:text-cyan-400">
              ({frame.burstInfo.flags.join(", ")})
            </span>
          )}
        </div>
      )}

      {/* Multi-bus Details */}
      {frame.multiBusInfo && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
          Seen on buses: {frame.multiBusInfo.buses.map(b => (
            <span key={b} className="ml-1">
              {b} ({frame.multiBusInfo!.countPerBus[b]}×)
            </span>
          ))}
        </div>
      )}

      {/* Signals */}
      {allSignals.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Signals
          </div>
          <div className="space-y-1">
            {allSignals.map((signal, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between text-[10px] ${
                  signal.source === 'default'
                    ? 'text-slate-400 dark:text-slate-500 italic'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <span className="font-mono">{signal.name}</span>
                <span>
                  bit[{signal.startBit}:{signal.startBit + signal.bitLength - 1}]
                  {signal.source === 'default' && ' (hex)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {frame.notes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Notes
          </div>
          <ul className="space-y-0.5">
            {frame.notes.map((note, idx) => (
              <li key={idx} className="text-[10px] text-slate-600 dark:text-slate-300">
                • {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mux Details
// ============================================================================

type MuxDetailsProps = {
  mux: MuxKnowledge;
};

function MuxDetails({ mux }: MuxDetailsProps) {
  return (
    <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-orange-600 dark:text-orange-400">
          {mux.isTwoByte ? "Two-byte mux" : "Mux"} selector:
        </span>
        <span className="font-mono">
          {mux.isTwoByte ? "byte[0:1]" : `byte[${mux.selectorByte}]`}
        </span>
        <span>
          (bit[{mux.selectorStartBit}:{mux.selectorStartBit + mux.selectorBitLength - 1}])
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-slate-400">Cases:</span>
        {mux.cases.slice(0, 16).map((c) => (
          <span
            key={c}
            className="px-1 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded font-mono"
          >
            {mux.isTwoByte ? `${Math.floor(c / 256)}.${c % 256}` : c}
          </span>
        ))}
        {mux.cases.length > 16 && (
          <span className="text-slate-400">+{mux.cases.length - 16} more</span>
        )}
      </div>
    </div>
  );
}
