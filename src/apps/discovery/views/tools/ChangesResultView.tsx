// ui/src/apps/discovery/views/tools/ChangesResultView.tsx

import { useState, useMemo } from "react";
import { GitCompare, RefreshCw, Minus, Activity, ChevronDown, ChevronRight, Layers, Thermometer, Type, Ruler, Copy, GitMerge, Download } from "lucide-react";
import { useDiscoveryStore } from "../../../../stores/discoveryStore";
import type { PayloadAnalysisResult, ByteStats, MuxCaseAnalysis, MultiBytePattern, MirrorGroup } from "../../../../utils/analysis/payloadAnalysis";
import { formatMuxValue } from "../../../../utils/analysis/muxDetection";
import { formatFrameId } from "../../../../utils/frameIds";
import ExportAnalysisDialog from "../../../../dialogs/ExportAnalysisDialog";
import { pickFileToSave } from "../../../../api/dialogs";
import { saveCatalog } from "../../../../api/catalog";
import { useSettings } from "../../../../hooks/useSettings";
import { getFilterForFormat, type ExportFormat } from "../../../../utils/reportExport";

// Helper to build a set of byte indices that are part of multi-byte patterns
function getBytesInMultiBytePatterns(patterns: MultiBytePattern[]): Set<number> {
  const bytes = new Set<number>();
  for (const pattern of patterns) {
    for (let i = pattern.startByte; i < pattern.startByte + pattern.length; i++) {
      bytes.add(i);
    }
  }
  return bytes;
}

// Helper to count bytes by role, excluding those in multi-byte patterns
function countByteRoles(byteStats: ByteStats[], multiBytePatterns: MultiBytePattern[]) {
  const bytesInPatterns = getBytesInMultiBytePatterns(multiBytePatterns);
  return {
    staticCount: byteStats.filter(s => s.role === 'static').length,
    counterCount: byteStats.filter(s => s.role === 'counter' && !bytesInPatterns.has(s.byteIndex)).length,
    sensorCount: byteStats.filter(s => s.role === 'sensor' && !bytesInPatterns.has(s.byteIndex)).length,
    valueCount: byteStats.filter(s => s.role === 'value' && !bytesInPatterns.has(s.byteIndex)).length,
    sensor16Count: multiBytePatterns.filter(p => p.pattern === 'sensor16').length,
    counter16Count: multiBytePatterns.filter(p => p.pattern === 'counter16').length,
    counter32Count: multiBytePatterns.filter(p => p.pattern === 'counter32').length,
    textCount: multiBytePatterns.filter(p => p.pattern === 'text').length,
  };
}

type Props = {
  embedded?: boolean;
};

export default function ChangesResultView({ embedded = false }: Props) {
  const results = useDiscoveryStore((s) => s.toolbox.changesResults);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const { settings } = useSettings();

  const handleExport = async (content: string, filename: string, format: ExportFormat) => {
    try {
      const path = await pickFileToSave({
        defaultPath: filename,
        filters: getFilterForFormat(format),
      });

      if (path) {
        await saveCatalog(path, content);
      }
    } catch (error) {
      console.error("Export failed:", error);
    }
    setShowExportDialog(false);
  };

  // Sort results by frameId and compute summary statistics
  const { sortedResults, summary, mirrorGroups } = useMemo(() => {
    if (!results) {
      return { sortedResults: [], summary: null, mirrorGroups: [] };
    }

    const sorted = [...results.analysisResults].sort((a, b) => a.frameId - b.frameId);

    const identicalCount = sorted.filter(r => r.isIdentical).length;
    const varyingLengthCount = sorted.filter(r => r.hasVaryingLength).length;
    const muxCount = sorted.filter(r => r.isMuxFrame).length;
    const burstCount = sorted.filter(r => r.isBurstFrame).length;
    const mirrorGroupCount = results.mirrorGroups?.length ?? 0;

    return {
      sortedResults: sorted,
      mirrorGroups: results.mirrorGroups ?? [],
      summary: {
        identicalCount,
        varyingLengthCount,
        muxCount,
        burstCount,
        mirrorGroupCount,
      },
    };
  }, [results]);

  if (!results) {
    const content = (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <GitCompare className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
          No results yet
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Select frames in the sidebar and click "Run Analysis" to detect payload patterns.
        </p>
      </div>
    );

    if (embedded) {
      return <div className="h-full flex flex-col">{content}</div>;
    }

    return (
      <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <Header onExport={() => {}} hasResults={false} />
        {content}
      </div>
    );
  }

  const mainContent = (
    <>
      {/* Summary Section */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-wrap gap-4 text-xs mb-2">
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{results.frameCount.toLocaleString()}</span> frames
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">{results.uniqueFrameIds}</span> unique IDs analyzed
          </span>
        </div>

        {/* Summary badges row */}
        {summary && (summary.identicalCount > 0 || summary.varyingLengthCount > 0 || summary.muxCount > 0 || summary.burstCount > 0 || summary.mirrorGroupCount > 0) && (
          <div className="flex flex-wrap gap-2 text-[10px]">
            {summary.mirrorGroupCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300">
                <GitMerge className="w-3 h-3" />
                {summary.mirrorGroupCount} mirror group{summary.mirrorGroupCount > 1 ? 's' : ''}
              </span>
            )}
            {summary.identicalCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                <Copy className="w-3 h-3" />
                {summary.identicalCount} identical
              </span>
            )}
            {summary.varyingLengthCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                <Ruler className="w-3 h-3" />
                {summary.varyingLengthCount} varying length
              </span>
            )}
            {summary.muxCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                <Layers className="w-3 h-3" />
                {summary.muxCount} multiplexed
              </span>
            )}
            {summary.burstCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                {summary.burstCount} burst
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto space-y-4">
        {/* Mirror Groups Section */}
        {mirrorGroups.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
              <GitMerge className="w-3.5 h-3.5" />
              Mirror Frames
            </div>
            {mirrorGroups.map((group, idx) => (
              <MirrorGroupCard key={idx} group={group} />
            ))}
          </div>
        )}

        {/* Individual Frame Cards */}
        {sortedResults.map((result) => (
          <FrameAnalysisCard key={result.frameId} result={result} />
        ))}
      </div>

      <ExportAnalysisDialog
        open={showExportDialog}
        results={results}
        defaultPath={settings?.report_dir}
        onCancel={() => setShowExportDialog(false)}
        onExport={handleExport}
      />
    </>
  );

  if (embedded) {
    return <div className="h-full flex flex-col">{mainContent}</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
      <Header onExport={() => setShowExportDialog(true)} hasResults={true} />
      {mainContent}
    </div>
  );
}

// ============================================================================
// Header
// ============================================================================

type HeaderProps = {
  onExport: () => void;
  hasResults?: boolean;
};

function Header({ onExport, hasResults = false }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
      <GitCompare className="w-5 h-5 text-purple-600 dark:text-purple-400" />
      <div className="flex-1">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Payload Changes Analysis
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Detected byte patterns and characteristics
        </p>
      </div>
      {hasResults && (
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
          title="Export analysis results"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Mirror Group Card
// ============================================================================

type MirrorGroupCardProps = {
  group: MirrorGroup;
};

function MirrorGroupCard({ group }: MirrorGroupCardProps) {
  return (
    <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg border border-pink-200 dark:border-pink-800/50">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {group.frameIds.map((id, idx) => (
              <span key={id}>
                <span className="font-mono font-semibold text-sm text-pink-700 dark:text-pink-300">
                  {formatFrameId(id)}
                </span>
                {idx < group.frameIds.length - 1 && (
                  <span className="text-pink-400 dark:text-pink-500 mx-1">↔</span>
                )}
              </span>
            ))}
          </div>
          <span className="text-xs text-pink-500 dark:text-pink-400">
            {group.matchPercentage}% match
          </span>
        </div>
        <span className="text-[10px] text-pink-500 dark:text-pink-400">
          {group.sampleCount} matching pairs
        </span>
      </div>

      {/* Sample payload */}
      {group.samplePayload && (
        <div className="mt-2 text-[10px] text-pink-600 dark:text-pink-300">
          <span className="text-pink-500 dark:text-pink-400">Sample: </span>
          <span className="font-mono">
            {group.samplePayload.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
          </span>
        </div>
      )}

      <div className="mt-1.5 text-[10px] text-pink-500 dark:text-pink-400">
        These frame IDs transmit identical payloads that change together
      </div>
    </div>
  );
}

// ============================================================================
// Frame Analysis Card
// ============================================================================

type FrameAnalysisCardProps = {
  result: PayloadAnalysisResult;
};

function FrameAnalysisCard({ result }: FrameAnalysisCardProps) {
  const counts = countByteRoles(result.byteStats, result.multiBytePatterns);

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm text-slate-700 dark:text-slate-200">
            {formatFrameId(result.frameId)}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {result.sampleCount} samples
          </span>
          {result.isBurstFrame && (
            <span className="px-1.5 py-0.5 text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded">
              Burst
            </span>
          )}
          {result.isMuxFrame && (
            <span className="px-1.5 py-0.5 text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded flex items-center gap-0.5">
              <Layers className="w-3 h-3" />
              Mux
            </span>
          )}
          {result.hasVaryingLength && result.lengthRange && (
            <span
              className="px-1.5 py-0.5 text-[10px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded flex items-center gap-0.5"
              title={`Frame length varies from ${result.lengthRange.min} to ${result.lengthRange.max} bytes`}
            >
              <Ruler className="w-3 h-3" />
              {result.lengthRange.min}–{result.lengthRange.max} bytes
            </span>
          )}
          {result.isIdentical && (
            <span
              className="px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded flex items-center gap-0.5"
              title="All payloads in this frame are identical"
            >
              <Copy className="w-3 h-3" />
              Identical
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {counts.staticCount > 0 && (
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <Minus className="w-3 h-3" />
              {counts.staticCount} static
            </span>
          )}
          {(counts.counterCount > 0 || counts.counter16Count > 0 || counts.counter32Count > 0) && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <RefreshCw className="w-3 h-3" />
              {counts.counterCount + counts.counter16Count + counts.counter32Count} counter
            </span>
          )}
          {(counts.sensorCount > 0 || counts.sensor16Count > 0) && (
            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
              <Thermometer className="w-3 h-3" />
              {counts.sensorCount + counts.sensor16Count} sensor
            </span>
          )}
          {counts.valueCount > 0 && (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Activity className="w-3 h-3" />
              {counts.valueCount} value
            </span>
          )}
          {counts.textCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Type className="w-3 h-3" />
              {counts.textCount} text
            </span>
          )}
        </div>
      </div>

      {/* Mux info line */}
      {result.isMuxFrame && result.muxInfo && (
        <div className="mb-3 text-[10px] text-orange-600 dark:text-orange-400">
          <span className="font-medium">Mux:</span>{" "}
          {result.muxInfo.isTwoByte ? "byte[0:1]" : `byte[${result.muxInfo.selectorByte}]`}
          , cases: {result.muxInfo.selectorValues.map(v => formatMuxValue(v, result.muxInfo!.isTwoByte)).join(", ")}
        </div>
      )}

      {/* Per-case analysis for mux frames */}
      {result.isMuxFrame && result.muxCaseAnalyses && result.muxCaseAnalyses.length > 0 ? (
        <div className="space-y-2">
          {result.muxCaseAnalyses.map((caseAnalysis) => (
            <MuxCaseSection
              key={caseAnalysis.muxValue}
              caseAnalysis={caseAnalysis}
              isTwoByte={result.muxInfo?.isTwoByte ?? false}
              analyzedFromByte={result.analyzedFromByte}
              analyzedToByteExclusive={result.analyzedToByteExclusive}
            />
          ))}
        </div>
      ) : (
        <>
          {/* Byte visualization (non-mux frames) - with multi-byte patterns inline */}
          <div className="mb-3">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
              Bytes {result.analyzedFromByte}–{result.analyzedToByteExclusive - 1}
            </div>
            <ByteVisualization
              byteStats={result.byteStats}
              multiBytePatterns={result.multiBytePatterns}
            />
          </div>

          {/* Notes */}
          {result.notes.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2">
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Notes
              </div>
              <ul className="space-y-0.5">
                {result.notes.map((note, idx) => (
                  <li key={idx} className="text-[10px] text-slate-600 dark:text-slate-300">
                    • {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Mux Case Section (expandable per-case analysis)
// ============================================================================

type MuxCaseSectionProps = {
  caseAnalysis: MuxCaseAnalysis;
  isTwoByte: boolean;
  analyzedFromByte: number;
  analyzedToByteExclusive: number;
};

function MuxCaseSection({ caseAnalysis, isTwoByte, analyzedFromByte, analyzedToByteExclusive }: MuxCaseSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const counts = countByteRoles(caseAnalysis.byteStats, caseAnalysis.multiBytePatterns);

  return (
    <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
          <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">
            Case {formatMuxValue(caseAnalysis.muxValue, isTwoByte)}
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            ({caseAnalysis.sampleCount} samples)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {counts.staticCount > 0 && (
            <span className="text-slate-500 dark:text-slate-400">{counts.staticCount} static</span>
          )}
          {(counts.counterCount > 0 || counts.counter16Count > 0 || counts.counter32Count > 0) && (
            <span className="text-green-600 dark:text-green-400">{counts.counterCount + counts.counter16Count + counts.counter32Count} counter</span>
          )}
          {(counts.sensorCount > 0 || counts.sensor16Count > 0) && (
            <span className="text-purple-600 dark:text-purple-400">{counts.sensorCount + counts.sensor16Count} sensor</span>
          )}
          {counts.valueCount > 0 && (
            <span className="text-blue-600 dark:text-blue-400">{counts.valueCount} value</span>
          )}
          {counts.textCount > 0 && (
            <span className="text-amber-600 dark:text-amber-400">{counts.textCount} text</span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 border-t border-slate-100 dark:border-slate-700">
          {/* Byte visualization */}
          <div className="mb-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
              Bytes {analyzedFromByte}–{analyzedToByteExclusive - 1}
            </div>
            <ByteVisualization
              byteStats={caseAnalysis.byteStats}
              multiBytePatterns={caseAnalysis.multiBytePatterns}
            />
          </div>

          {/* Notes */}
          {caseAnalysis.notes.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-600 pt-1.5 mt-1.5">
              <ul className="space-y-0.5">
                {caseAnalysis.notes.map((note, idx) => (
                  <li key={idx} className="text-[10px] text-slate-600 dark:text-slate-300">
                    • {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Byte Chip
// ============================================================================

type ByteChipProps = {
  byte: ByteStats;
};

function ByteChip({ byte }: ByteChipProps) {
  let bgClass = "bg-slate-200 dark:bg-slate-700";
  let textClass = "text-slate-600 dark:text-slate-300";
  let title = `byte[${byte.byteIndex}]: unknown`;

  if (byte.role === 'static') {
    bgClass = "bg-slate-300 dark:bg-slate-600";
    textClass = "text-slate-700 dark:text-slate-200";
    title = `byte[${byte.byteIndex}]: static = 0x${byte.staticValue!.toString(16).toUpperCase().padStart(2, '0')}`;
  } else if (byte.role === 'counter') {
    bgClass = "bg-green-100 dark:bg-green-900/30";
    textClass = "text-green-700 dark:text-green-300";
    const dir = byte.counterDirection === 'up' ? '↑' : '↓';
    if (byte.isLoopingCounter && byte.loopingRange && byte.loopingModulo) {
      title = `byte[${byte.byteIndex}]: looping counter ${dir} step=${byte.counterStep}, range ${byte.loopingRange.min}–${byte.loopingRange.max} (mod ${byte.loopingModulo})`;
    } else {
      const rollover = byte.rolloverDetected ? ' (rollover)' : '';
      title = `byte[${byte.byteIndex}]: counter ${dir} step=${byte.counterStep}${rollover}`;
    }
  } else if (byte.role === 'sensor') {
    bgClass = "bg-orange-100 dark:bg-orange-900/30";
    textClass = "text-orange-700 dark:text-orange-300";
    const trend = byte.sensorTrend === 'increasing' ? '↑' : byte.sensorTrend === 'decreasing' ? '↓' : '↕';
    const strength = byte.trendStrength ? ` (${Math.round(byte.trendStrength * 100)}% trend)` : '';
    title = `byte[${byte.byteIndex}]: sensor ${trend} range ${byte.min}–${byte.max}${strength}`;
  } else if (byte.role === 'value') {
    bgClass = "bg-blue-100 dark:bg-blue-900/30";
    textClass = "text-blue-700 dark:text-blue-300";
    title = `byte[${byte.byteIndex}]: value range ${byte.min}–${byte.max} (${byte.uniqueValues.size} unique)`;
  }

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${bgClass} ${textClass}`}
      title={title}
    >
      {byte.byteIndex}
      {byte.role === 'static' && (
        <span className="ml-0.5 opacity-60">
          ={byte.staticValue!.toString(16).toUpperCase().padStart(2, '0')}
        </span>
      )}
      {byte.role === 'counter' && (
        <span className="ml-0.5">
          {byte.counterDirection === 'up' ? '↑' : '↓'}
          {byte.isLoopingCounter && byte.loopingModulo ? (
            <span className="opacity-70 text-[8px]">%{byte.loopingModulo}</span>
          ) : (
            byte.rolloverDetected && '↻'
          )}
        </span>
      )}
      {byte.role === 'sensor' && (
        <span className="ml-0.5">
          {byte.sensorTrend === 'increasing' ? '↑' : byte.sensorTrend === 'decreasing' ? '↓' : '↕'}
          {byte.rolloverDetected && '↻'}
        </span>
      )}
      {byte.role === 'value' && (
        <span className="ml-0.5 opacity-60">~</span>
      )}
    </span>
  );
}

// ============================================================================
// Multi-byte Pattern Chip
// ============================================================================

type MultiByteChipProps = {
  pattern: MultiBytePattern;
};

function MultiByteChip({ pattern }: MultiByteChipProps) {
  let bgClass = "bg-purple-100 dark:bg-purple-900/30";
  let textClass = "text-purple-700 dark:text-purple-300";
  let label = '';
  let icon = '';
  let displayText = '';

  if (pattern.pattern === 'sensor16') {
    bgClass = "bg-purple-100 dark:bg-purple-900/30";
    textClass = "text-purple-700 dark:text-purple-300";
    label = 'sensor16';
    icon = '⚡';
  } else if (pattern.pattern === 'counter16') {
    bgClass = "bg-green-100 dark:bg-green-900/30";
    textClass = "text-green-700 dark:text-green-300";
    label = 'counter16';
    icon = '↻';
  } else if (pattern.pattern === 'counter32') {
    bgClass = "bg-green-100 dark:bg-green-900/30";
    textClass = "text-green-700 dark:text-green-300";
    label = 'counter32';
    icon = '↻';
  } else if (pattern.pattern === 'text') {
    bgClass = "bg-amber-100 dark:bg-amber-900/30";
    textClass = "text-amber-700 dark:text-amber-300";
    label = 'text';
    icon = 'Aa';
    displayText = pattern.sampleText ? ` "${pattern.sampleText}"` : '';
  } else {
    label = pattern.pattern;
  }

  const endianChar = pattern.endianness === 'little' ? 'LE' : pattern.endianness === 'big' ? 'BE' : '';
  const rangeStr = (pattern.minValue !== undefined && pattern.maxValue !== undefined)
    ? ` ${pattern.minValue}–${pattern.maxValue}`
    : '';
  const textSample = pattern.sampleText ? ` "${pattern.sampleText}"` : '';
  const title = `${label} @ byte[${pattern.startByte}:${pattern.startByte + pattern.length - 1}]${endianChar ? ` ${endianChar}` : ''}${rangeStr}${textSample}${pattern.correlatedRollover ? ' (rollover correlation)' : ''}`;

  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${bgClass} ${textClass}`}
      title={title}
    >
      {pattern.startByte}–{pattern.startByte + pattern.length - 1}
      <span className="ml-0.5">{icon}</span>
      {endianChar && <span className="ml-0.5 opacity-60 text-[8px]">{endianChar}</span>}
      {displayText && <span className="ml-1 opacity-80">{displayText}</span>}
    </span>
  );
}

// ============================================================================
// Byte Visualization (combines single bytes and multi-byte patterns)
// ============================================================================

type ByteVisualizationProps = {
  byteStats: ByteStats[];
  multiBytePatterns: MultiBytePattern[];
};

function ByteVisualization({ byteStats, multiBytePatterns }: ByteVisualizationProps) {
  // Build a map of byte index -> pattern for quick lookup
  const patternByStartByte = new Map<number, MultiBytePattern>();
  const bytesInPatterns = new Set<number>();

  for (const pattern of multiBytePatterns) {
    patternByStartByte.set(pattern.startByte, pattern);
    for (let i = pattern.startByte; i < pattern.startByte + pattern.length; i++) {
      bytesInPatterns.add(i);
    }
  }

  // Build visualization elements in byte order
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < byteStats.length) {
    const byte = byteStats[i];
    const pattern = patternByStartByte.get(byte.byteIndex);

    if (pattern) {
      // Render multi-byte pattern chip
      elements.push(
        <MultiByteChip key={`pattern-${pattern.startByte}`} pattern={pattern} />
      );
      // Skip the bytes covered by this pattern
      i += pattern.length;
    } else if (bytesInPatterns.has(byte.byteIndex)) {
      // This byte is part of a pattern but not the start - skip it
      i++;
    } else {
      // Render single byte chip
      elements.push(
        <ByteChip key={`byte-${byte.byteIndex}`} byte={byte} />
      );
      i++;
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      {elements}
    </div>
  );
}
