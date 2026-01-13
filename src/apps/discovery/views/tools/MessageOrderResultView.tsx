// ui/src/apps/discovery/views/tools/MessageOrderResultView.tsx

import { useState } from "react";
import { ListOrdered, Clock, Layers, Play, Shuffle, Zap, GitBranch, Download } from "lucide-react";
import { useDiscoveryStore } from "../../../../stores/discoveryStore";
import type { DetectedPattern, IntervalGroup, StartIdCandidate, MultiplexedFrame, BurstFrame, MultiBusFrame } from "../../../../utils/analysis/messageOrderAnalysis";
import { useSettings } from "../../../../hooks/useSettings";
import { formatFrameId } from "../../../../utils/frameIds";
import { formatMs } from "../../../../utils/reportExport";
import ExportReportDialog from "../../../../dialogs/ExportReportDialog";
import { pickFileToSave } from "../../../../api/dialogs";
import { saveCatalog } from "../../../../api/catalog";
import { generateFrameOrderReport } from "../../../../utils/frameOrderReport";
import { getFilterForFormat, type ExportFormat } from "../../../../utils/reportExport";

type Props = {
  embedded?: boolean;
};

export default function MessageOrderResultView({ embedded = false }: Props) {
  const results = useDiscoveryStore((s) => s.toolbox.messageOrderResults);
  const updateOptions = useDiscoveryStore((s) => s.updateMessageOrderOptions);
  const runAnalysis = useDiscoveryStore((s) => s.runAnalysis);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { settings } = useSettings();

  const handleSelectStartId = async (id: number) => {
    updateOptions({ startMessageId: id });
    await runAnalysis();
  };

  const handleExport = async (format: ExportFormat, filename: string) => {
    if (!results) return;
    try {
      const content = generateFrameOrderReport(results, format);
      const path = await pickFileToSave({
        defaultPath: filename,
        filters: getFilterForFormat(format),
      });
      if (path) {
        await saveCatalog(path, content);
      }
    } catch (err) {
      console.error("Failed to export report:", err);
    }
    setShowExportDialog(false);
  };

  if (!results) {
    return (
      <div className={`h-full flex flex-col ${embedded ? "" : "bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"}`}>
        {!embedded && <Header onExport={() => {}} hasResults={false} />}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <ListOrdered className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
            No results yet
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            Select frames and click "Run Analysis" to detect message order patterns.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${embedded ? "" : "bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"}`}>
      {!embedded && <Header onExport={() => setShowExportDialog(true)} hasResults={true} />}

      {/* Stats Summary */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{results.totalFramesAnalyzed.toLocaleString()}</span> frames
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{results.uniqueFrameIds}</span> unique IDs
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{formatMs(results.timeSpanMs)}</span> span
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto space-y-6">
        {/* Detected Patterns */}
        <PatternSection patterns={results.patterns} />

        {/* Multiplexed Frames */}
        <MultiplexedSection multiplexed={results.multiplexedFrames} />

        {/* Burst/Transaction Frames */}
        <BurstSection bursts={results.burstFrames} />

        {/* Multi-Bus Frames */}
        <MultiBusSection multiBus={results.multiBusFrames} />

        {/* Start ID Candidates */}
        <CandidatesSection
          candidates={results.startIdCandidates}
          onSelect={handleSelectStartId}
        />

        {/* Interval Groups */}
        <IntervalSection
          groups={results.intervalGroups}
          multiplexedIds={new Set(results.multiplexedFrames.map(m => m.frameId))}
          burstIds={new Set(results.burstFrames.map(b => b.frameId))}
        />
      </div>

      <ExportReportDialog
        open={showExportDialog}
        title="Export Frame Order Analysis"
        description={`Export analysis of ${results.uniqueFrameIds} frame IDs (${results.totalFramesAnalyzed.toLocaleString()} samples)`}
        defaultFilename="frame-order-report"
        defaultPath={settings?.report_dir}
        onCancel={() => setShowExportDialog(false)}
        onExport={handleExport}
      />
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

type HeaderProps = {
  onExport: () => void;
  hasResults: boolean;
};

function Header({ onExport, hasResults }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
      <ListOrdered className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      <div className="flex-1">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Frame Order Analysis
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Detected transmission patterns and timing
        </p>
      </div>
      {hasResults && (
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Export report"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Pattern Section
// ============================================================================

type PatternSectionProps = {
  patterns: DetectedPattern[];
};

function PatternSection({ patterns }: PatternSectionProps) {
  if (patterns.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Play className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">Detected Patterns</h3>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No patterns detected. Try selecting a Start Message ID from the candidates below.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Play className="w-4 h-4 text-purple-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Detected Patterns ({patterns.length})
        </h3>
      </div>
      <div className="space-y-3">
        {patterns.map((pattern, idx) => (
          <PatternCard key={idx} pattern={pattern} rank={idx + 1} />
        ))}
      </div>
    </section>
  );
}

type PatternCardProps = {
  pattern: DetectedPattern;
  rank: number;
};

function PatternCard({ pattern, rank }: PatternCardProps) {
  const confidencePercent = Math.round(pattern.confidence * 100);
  const isHighConfidence = pattern.confidence >= 0.8;

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Pattern #{rank}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            starts with <span className="font-mono text-purple-600 dark:text-purple-400">{formatFrameId(pattern.startId)}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            {pattern.occurrences}× seen
          </span>
          <span
            className={`font-medium ${
              isHighConfidence
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            {confidencePercent}% consistent
          </span>
        </div>
      </div>

      {/* Sequence */}
      <div className="flex flex-wrap gap-1 mb-2">
        {pattern.sequence.map((id, i) => (
          <span
            key={i}
            className={`px-1.5 py-0.5 rounded text-xs font-mono ${
              i === 0
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
            }`}
          >
            {formatFrameId(id)}
          </span>
        ))}
      </div>

      <div className="text-xs text-slate-400 dark:text-slate-500">
        {pattern.sequence.length} frames • avg cycle: {formatMs(pattern.avgCycleTimeMs)}
      </div>
    </div>
  );
}

// ============================================================================
// Candidates Section
// ============================================================================

type CandidatesSectionProps = {
  candidates: StartIdCandidate[];
  onSelect: (id: number) => void;
};

function CandidatesSection({ candidates, onSelect }: CandidatesSectionProps) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-blue-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Start ID Candidates
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          (sorted by max gap before)
        </span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Frame ID</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Max Gap</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Avg Gap</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Min Gap</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Count</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, idx) => (
              <tr
                key={candidate.id}
                className={idx % 2 === 0 ? "" : "bg-slate-100/50 dark:bg-slate-800/50"}
              >
                <td className="px-3 py-2 font-mono text-purple-600 dark:text-purple-400">
                  {formatFrameId(candidate.id)}
                </td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                  {formatMs(candidate.maxGapBeforeMs)}
                </td>
                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                  {formatMs(candidate.avgGapBeforeMs)}
                </td>
                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                  {formatMs(candidate.minGapBeforeMs)}
                </td>
                <td className="px-3 py-2 text-right text-slate-500 dark:text-slate-400">
                  {candidate.occurrences}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onSelect(candidate.id)}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Use
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Multiplexed Section
// ============================================================================

type MultiplexedSectionProps = {
  multiplexed: MultiplexedFrame[];
};

function MultiplexedSection({ multiplexed }: MultiplexedSectionProps) {
  if (multiplexed.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Shuffle className="w-4 h-4 text-orange-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Potential Multiplexed Frames ({multiplexed.length})
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          (same ID, byte[0] increments)
        </span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Frame ID</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Selector</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Cases</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Mux Period</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Inter-msg</th>
            </tr>
          </thead>
          <tbody>
            {multiplexed.map((mux, idx) => (
              <tr
                key={mux.frameId}
                className={idx % 2 === 0 ? "" : "bg-slate-100/50 dark:bg-slate-800/50"}
              >
                <td className="px-3 py-2 font-mono text-orange-600 dark:text-orange-400">
                  {formatFrameId(mux.frameId)}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  {mux.selectorByte === -1 ? "byte[0:1]" : `byte[${mux.selectorByte}]`}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {mux.selectorByte === -1 ? (
                      // Two-byte mux: show as "b0.b1" format
                      mux.selectorValues.map((val) => {
                        const b0 = Math.floor(val / 256);
                        const b1 = val % 256;
                        return (
                          <span
                            key={val}
                            className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-[10px] font-mono"
                          >
                            {b0}.{b1}
                          </span>
                        );
                      })
                    ) : (
                      // Single-byte mux
                      mux.selectorValues.map((val) => (
                        <span
                          key={val}
                          className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-[10px] font-mono"
                        >
                          {val}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatMs(mux.muxPeriodMs)}
                </td>
                <td className="px-3 py-2 text-right text-slate-400 dark:text-slate-500">
                  {formatMs(mux.interMessageMs)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Burst/Transaction Section
// ============================================================================

type BurstSectionProps = {
  bursts: BurstFrame[];
};

function BurstSection({ bursts }: BurstSectionProps) {
  if (bursts.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-cyan-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Burst/Transaction Frames ({bursts.length})
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          (variable DLC, request-response patterns)
        </span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Frame ID</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">DLCs</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Burst Size</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Cycle</th>
              <th className="text-right px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Intra-burst</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Flags</th>
            </tr>
          </thead>
          <tbody>
            {bursts.map((burst, idx) => (
              <tr
                key={burst.frameId}
                className={idx % 2 === 0 ? "" : "bg-slate-100/50 dark:bg-slate-800/50"}
              >
                <td className="px-3 py-2 font-mono text-cyan-600 dark:text-cyan-400">
                  {formatFrameId(burst.frameId)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {burst.dlcVariation.map((dlc) => (
                      <span
                        key={dlc}
                        className="px-1.5 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded text-[10px] font-mono"
                      >
                        {dlc}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                  {burst.burstCount === 1 ? "—" : `~${burst.burstCount}`}
                </td>
                <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatMs(burst.burstPeriodMs)}
                </td>
                <td className="px-3 py-2 text-right text-slate-400 dark:text-slate-500">
                  {burst.burstCount > 1 ? formatMs(burst.interMessageMs) : "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {burst.flags.map((flag) => (
                      <span
                        key={flag}
                        className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px]"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Multi-Bus Section
// ============================================================================

type MultiBusSectionProps = {
  multiBus: MultiBusFrame[];
};

function MultiBusSection({ multiBus }: MultiBusSectionProps) {
  if (multiBus.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <GitBranch className="w-4 h-4 text-rose-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Multi-Bus Frames ({multiBus.length})
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          (same ID seen on multiple buses)
        </span>
      </div>
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Frame ID</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Buses</th>
              <th className="text-left px-3 py-2 font-medium text-slate-500 dark:text-slate-400">Count per Bus</th>
            </tr>
          </thead>
          <tbody>
            {multiBus.map((frame, idx) => (
              <tr
                key={frame.frameId}
                className={idx % 2 === 0 ? "" : "bg-slate-100/50 dark:bg-slate-800/50"}
              >
                <td className="px-3 py-2 font-mono text-rose-600 dark:text-rose-400">
                  {formatFrameId(frame.frameId)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {frame.buses.map((bus) => (
                      <span
                        key={bus}
                        className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded text-[10px] font-mono"
                      >
                        Bus {bus}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {frame.buses.map((bus) => (
                      <span
                        key={bus}
                        className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px]"
                      >
                        {bus}: {frame.countPerBus[bus]}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// Interval Section
// ============================================================================

type IntervalSectionProps = {
  groups: IntervalGroup[];
  multiplexedIds: Set<number>;
  burstIds: Set<number>;
};

function IntervalSection({ groups, multiplexedIds, burstIds }: IntervalSectionProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-emerald-500" />
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Repetition Period Groups
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          (frames grouped by how often they repeat)
        </span>
      </div>
      <div className="space-y-2">
        {groups.map((group, idx) => (
          <div
            key={idx}
            className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                ~{formatMs(group.intervalMs)}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                ({group.frameIds.length} frame{group.frameIds.length !== 1 ? "s" : ""})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {group.frameIds.map((id) => {
                const isMux = multiplexedIds.has(id);
                const isBurst = burstIds.has(id);
                return (
                  <span
                    key={id}
                    className={`px-1 py-0.5 rounded text-[10px] font-mono ${
                      isMux
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                        : isBurst
                        ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    }`}
                    title={isMux ? "Multiplexed frame" : isBurst ? "Burst/transaction frame" : undefined}
                  >
                    {formatFrameId(id)}
                    {isMux && <span className="ml-0.5 text-orange-500">⚡</span>}
                    {isBurst && !isMux && <span className="ml-0.5 text-cyan-500">⚡</span>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
