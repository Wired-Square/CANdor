// ui/src/apps/discovery/components/FrameDataTable.tsx
//
// Shared frame data table component for Discovery views.
// Optimised for streaming: SVG sprites, event delegation, stable keys.

import { ReactNode, forwardRef, useRef, useEffect, useCallback, type MouseEvent } from 'react';
import { useAutoRowCount } from '../../../hooks/useAutoRowCount';
import { useFrameIdFormat } from '../../../hooks/useFrameIdFormat';
import { sendHexDataToCalculator } from '../../../utils/windowCommunication';
import { bytesToHex, bytesToAscii } from '../../../utils/byteUtils';
import { frameRowKey } from '../../../utils/frameKey';
import { formatHumanUs } from '../../../utils/timeFormat';
import {
  bgDataView,
  borderDataView,
  textDataSecondary,
  textDataTertiary,
  hoverDataRow,
  textDataGreen,
  textDataYellow,
  textDataOrange,
  textDataPurple,
  textDataAmber,
  textDataCyan,
  bgCyan,
} from '../../../styles';
import { emptyStateContainer, emptyStateText } from '../../../styles/typography';
import { tableIconButtonDark } from '../../../styles/buttonStyles';

/** Height of the spacer below the rows, in px. */
const RESERVED_PX = 32;

// ============================================================================
// Types
// ============================================================================

export interface FrameRow {
  timestamp_us: number;
  frame_id: number;
  /** Protocol that produced this frame (e.g. "can", "modbus", "serial"). Defaults to "can". */
  protocol: string;
  is_extended?: boolean;
  source_address?: number;
  dlc: number;
  bytes: number[];
  /** Pre-computed hex bytes for display */
  hexBytes?: string[];
  /** Mark frame as incomplete (serial framing) */
  incomplete?: boolean;
  /** CAN bus number (0-255) */
  bus?: number;
}

export interface FrameDataTableProps {
  /** Frames to display */
  frames: FrameRow[];
  /** Format time display - callback receives current and previous timestamp */
  formatTime: (timestampUs: number, prevTimestampUs: number | null) => ReactNode;
  /** Whether to show source address column */
  showSourceAddress?: boolean;
  /** Called when bookmark button is clicked (omit to hide bookmark button) */
  onBookmark?: (frameId: number, timestampUs: number) => void;
  /** Called when calculator button is clicked (omit to hide calculator button) */
  onCalculator?: (bytes: number[]) => void;
  /** Show calculator button (default: true if onCalculator not provided, uses default handler) */
  showCalculator?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Number of source bytes for padding (serial extraction) */
  sourceByteCount?: number;
  /** Custom byte renderer (for colored extraction regions in serial) */
  renderBytes?: (frame: FrameRow) => ReactNode;
  /** Show ASCII column (default: false) */
  showAscii?: boolean;
  /** Show bus number column (default: false) */
  showBus?: boolean;
  /** Show frame reference # column (default: true) */
  showRef?: boolean;
  /** Show frame ID column (default: true) - set to false for serial frames */
  showId?: boolean;
  /** Auto-scroll to bottom when new frames arrive (default: true) */
  autoScroll?: boolean;
  /** Index of the row to highlight within the visible frames (0-based) */
  highlightedRowIndex?: number | null;
  /** Called when a row is clicked (receives row index within visible frames) */
  onRowClick?: (rowIndex: number) => void;
  /** Called when a row is right-clicked (receives frame data and mouse position) */
  onContextMenu?: (frame: FrameRow, position: { x: number; y: number }) => void;
  /** Called when the header row is right-clicked */
  onHeaderContextMenu?: (position: { x: number; y: number }) => void;
  /** Starting frame index for the current page (for tooltip display) */
  pageStartIndex?: number;
  /** 1-based original buffer positions for each frame. When provided, used for # column instead of computed page offset. */
  captureIndices?: number[];
  /** Optional leading status column — renders per-row status indicator with matching header */
  renderRowStatus?: (frame: FrameRow, index: number) => ReactNode;
  /** Whether to use local timezone for tooltip timestamps */
  useLocalTimezone?: boolean;
  /**
   * Measure how many rows fit and report it, for callers sizing their page to the panel.
   *
   * The table owns the scroll container, the sticky header and the trailing spacer, so it
   * is the only thing that can describe its own geometry — a caller would otherwise have
   * to restate all three and would silently drift when they change here.
   */
  autoFit?: boolean;
  /** Called with the number of rows that fit, when `autoFit` is set. */
  onFitChange?: (rows: number) => void;
}

// ============================================================================
// SVG icon sprites — defined once, referenced via <use> in each row.
// ============================================================================

function IconSprites() {
  return (
    <svg className="hidden" aria-hidden="true">
      <defs>
        <symbol id="fdt-bookmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </symbol>
        <symbol id="fdt-calculator" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect width="16" height="20" x="4" y="2" rx="2" />
          <line x1="8" x2="16" y1="6" y2="6" />
          <line x1="16" x2="16" y1="14" y2="18" />
          <path d="M16 10h.01" /><path d="M12 10h.01" /><path d="M8 10h.01" />
          <path d="M12 14h.01" /><path d="M8 14h.01" />
          <path d="M12 18h.01" /><path d="M8 18h.01" />
        </symbol>
      </defs>
    </svg>
  );
}

function UseIcon({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/** Walk up from event target to find the closest <tr> with data-idx. */
function rowIndexFromEvent(e: MouseEvent): number | null {
  const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-idx]');
  if (!tr) return null;
  const idx = parseInt(tr.dataset.idx!, 10);
  return Number.isFinite(idx) ? idx : null;
}

/** Default byte renderer — hex string with colour based on completeness */
function DefaultBytes({ frame }: { frame: FrameRow }) {
  const hexBytes = frame.hexBytes ?? frame.bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase());
  return (
    <span className={`break-all ${frame.incomplete ? textDataOrange : textDataGreen}`}>
      {hexBytes.join(' ')}
    </span>
  );
}

// ============================================================================
// Component
// ============================================================================

const FrameDataTable = forwardRef<HTMLDivElement, FrameDataTableProps>(({
  frames,
  formatTime,
  showSourceAddress = false,
  onBookmark,
  onCalculator,
  showCalculator = true,
  emptyMessage = 'No frames to display',
  sourceByteCount = 2,
  renderBytes,
  showRef = true,
  showAscii = false,
  showBus = false,
  showId = true,
  autoScroll = true,
  highlightedRowIndex,
  onRowClick,
  onContextMenu,
  onHeaderContextMenu,
  pageStartIndex = 0,
  captureIndices,
  renderRowStatus,
  useLocalTimezone = false,
  autoFit = false,
  onFitChange,
}, ref) => {
  const { format: formatId } = useFrameIdFormat();
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = (ref as React.RefObject<HTMLDivElement>) || internalRef;

  const autoFitRows = useAutoRowCount({
    containerRef,
    enabled: autoFit,
    rowSelector: "tbody > tr",
    headerSelector: "thead",
    reservedPx: RESERVED_PX,
  });

  const onFitChangeRef = useRef(onFitChange);
  onFitChangeRef.current = onFitChange;
  useEffect(() => {
    if (autoFit && autoFitRows.rows !== null) onFitChangeRef.current?.(autoFitRows.rows);
  }, [autoFit, autoFitRows.rows]);

  // Re-measure until a real row has been measured — that is what replaces the assumed
  // row height. Once it has, new data cannot change the fit, so this stops firing and
  // the live stream doesn't drive a measure pass on every batch.
  const { isMeasured, remeasure } = autoFitRows;
  useEffect(() => {
    if (autoFit && !isMeasured) remeasure();
  }, [autoFit, isMeasured, remeasure, frames.length]);
  const wasAtBottom = useRef(true);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Keep mutable refs for callbacks used in event delegation so handlers are stable
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const onBookmarkRef = useRef(onBookmark);
  onBookmarkRef.current = onBookmark;
  const onCalculatorRef = useRef(onCalculator);
  onCalculatorRef.current = onCalculator;
  const onRowClickRef = useRef(onRowClick);
  onRowClickRef.current = onRowClick;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    wasAtBottom.current = scrollTop + clientHeight >= scrollHeight - 10;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (autoScroll && wasAtBottom.current && container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [frames, autoScroll, containerRef]);

  useEffect(() => {
    if (highlightedRowIndex != null && highlightedRowRef.current) {
      requestAnimationFrame(() => {
        highlightedRowRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
    }
  }, [highlightedRowIndex, frames]);

  // ---- Event delegation handlers (stable — no per-row closures) ----

  const handleBodyClick = useCallback((e: MouseEvent) => {
    // Check for action buttons first
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (btn) {
      const idx = rowIndexFromEvent(e);
      if (idx == null) return;
      const frame = framesRef.current[idx];
      if (!frame) return;

      const action = btn.dataset.action;
      if (action === 'bookmark' && onBookmarkRef.current) {
        onBookmarkRef.current(frame.frame_id, frame.timestamp_us);
      } else if (action === 'calculator') {
        if (onCalculatorRef.current) {
          onCalculatorRef.current(frame.bytes);
        } else {
          sendHexDataToCalculator(bytesToHex(frame.bytes));
        }
      }
      return;
    }

    // Row click
    if (onRowClickRef.current) {
      const idx = rowIndexFromEvent(e);
      if (idx != null) onRowClickRef.current(idx);
    }
  }, []);

  const handleBodyContextMenu = useCallback((e: MouseEvent) => {
    if (!onContextMenuRef.current) return;
    const idx = rowIndexFromEvent(e);
    if (idx == null) return;
    const frame = framesRef.current[idx];
    if (!frame) return;
    e.preventDefault();
    onContextMenuRef.current(frame, { x: e.clientX, y: e.clientY });
  }, []);

  const srcPadding = sourceByteCount * 2;

  return (
    <div
      ref={ref || internalRef}
      className={`flex-1 min-h-0 overflow-auto font-mono text-xs ${bgDataView}`}
      onScroll={handleScroll}
    >
      <IconSprites />
      {/*
        `table-fixed` + <colgroup> keeps column widths independent of the rows on the
        current page, so toggling #/Bus/ASCII (or paging to frames with wider payloads)
        is a repaint rather than a full re-solve of every column. Data carries no width:
        it is the sole flexible column and absorbs whatever is left over.
      */}
      <table className="w-full table-fixed">
        <colgroup>
          {renderRowStatus && <col className="w-8" />}
          {onBookmark && <col className="w-7" />}
          {showRef && <col className="w-16" />}
          <col className="w-56" />
          {showId && <col className="w-24" />}
          {showBus && <col className="w-12" />}
          {showSourceAddress && <col className="w-20" />}
          <col className="w-12" />
          {showCalculator && <col className="w-7" />}
          <col />
          {showAscii && <col className="w-32" />}
        </colgroup>
        <thead className={`sticky top-0 z-10 ${bgDataView} ${textDataSecondary}`}>
          <tr onContextMenu={onHeaderContextMenu ? (e) => { e.preventDefault(); onHeaderContextMenu({ x: e.clientX, y: e.clientY }); } : undefined}>
            {renderRowStatus && (
              <th className={`px-1 py-1.5 border-b ${borderDataView}`}></th>
            )}
            {onBookmark && (
              <th className={`px-1 py-1.5 border-b ${borderDataView}`}></th>
            )}
            {showRef && (
              <th className={`text-right px-2 py-1.5 border-b ${borderDataView} ${textDataSecondary}`}>#</th>
            )}
            <th className={`text-left px-2 py-1.5 border-b ${borderDataView}`}>Time</th>
            {showId && (
              <th className={`text-right px-2 py-1.5 border-b ${borderDataView}`}>ID</th>
            )}
            {showBus && (
              <th className={`text-center px-2 py-1.5 border-b ${borderDataView} ${textDataCyan}`}>Bus</th>
            )}
            {showSourceAddress && (
              <th className={`text-right px-2 py-1.5 border-b ${borderDataView} ${textDataPurple}`}>Source</th>
            )}
            <th className={`text-left px-2 py-1.5 border-b ${borderDataView}`}>Len</th>
            {showCalculator && (
              <th className={`px-1 py-1.5 border-b ${borderDataView}`}></th>
            )}
            <th className={`text-left px-2 py-1.5 border-b ${borderDataView}`}>Data</th>
            {showAscii && (
              <th className={`text-left px-2 py-1.5 border-b ${borderDataView}`}>ASCII</th>
            )}
          </tr>
        </thead>
        <tbody onClick={handleBodyClick} onContextMenu={handleBodyContextMenu}>
          {frames.map((frame, idx, arr) => {
            const prevFrame = idx > 0 ? arr[idx - 1] : null;
            const isCurrentFrame = highlightedRowIndex != null && idx === highlightedRowIndex;
            // Rust supplies the row's capture position; the page offset is only a
            // fallback for callers that don't pass indices.
            const displayIndex = captureIndices?.[idx] ?? (pageStartIndex + idx + 1);
            const cellHighlight = isCurrentFrame ? bgCyan : '';

            return (
              <tr
                ref={isCurrentFrame ? highlightedRowRef : undefined}
                key={frameRowKey(captureIndices?.[idx], pageStartIndex + idx)}
                data-idx={idx}
                className={`${isCurrentFrame ? '' : hoverDataRow} ${frame.incomplete ? 'opacity-60' : ''} ${isCurrentFrame ? 'ring-1 ring-[color:var(--status-cyan-border)]' : ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                title={`Frame ${displayIndex}${frame.incomplete ? ' - Incomplete (no delimiter found)' : ''}`}
              >
                {renderRowStatus && (
                  <td className={`px-1 py-0.5 ${cellHighlight}`}>
                    {renderRowStatus(frame, idx)}
                  </td>
                )}
                {onBookmark && (
                  <td className={`px-1 py-0.5 ${cellHighlight}`}>
                    <button data-action="bookmark" className={tableIconButtonDark} title="Add bookmark at this frame's time">
                      <UseIcon id="fdt-bookmark" className={`w-3 h-3 ${textDataAmber}`} />
                    </button>
                  </td>
                )}
                {showRef && (
                  <td className={`px-2 py-0.5 text-right tabular-nums ${textDataTertiary} ${cellHighlight}`}>
                    {displayIndex.toLocaleString()}
                  </td>
                )}
                <td
                  className={`px-2 py-0.5 ${cellHighlight}`}
                  title={formatHumanUs(frame.timestamp_us, useLocalTimezone)}
                >
                  <span className={textDataTertiary}>{formatTime(frame.timestamp_us, prevFrame?.timestamp_us ?? null)}</span>
                </td>
                {showId && (
                  <td className={`px-2 py-0.5 text-right ${frame.incomplete ? textDataOrange : textDataYellow} ${cellHighlight}`}>
                    {formatId(frame.frame_id, frame.is_extended)}
                    {frame.incomplete && <span className={`ml-1 ${textDataOrange}`}>?</span>}
                  </td>
                )}
                {showBus && (
                  <td className={`px-2 py-0.5 text-center ${textDataCyan} ${cellHighlight}`}>
                    {frame.bus ?? 0}
                  </td>
                )}
                {showSourceAddress && (
                  <td className={`px-2 py-0.5 text-right ${textDataPurple} ${cellHighlight}`}>
                    {frame.source_address !== undefined
                      ? `0x${frame.source_address.toString(16).toUpperCase().padStart(srcPadding, '0')}`
                      : '-'
                    }
                  </td>
                )}
                <td className={`px-2 py-0.5 ${textDataSecondary} ${cellHighlight}`}>{frame.dlc}</td>
                {showCalculator && (
                  <td className={`px-1 py-0.5 ${cellHighlight}`}>
                    <button data-action="calculator" className={tableIconButtonDark} title="Send to Frame Calculator">
                      <UseIcon id="fdt-calculator" className={`w-3 h-3 ${textDataOrange}`} />
                    </button>
                  </td>
                )}
                <td className={`px-2 py-0.5 ${cellHighlight}`}>
                  {renderBytes ? renderBytes(frame) : <DefaultBytes frame={frame} />}
                </td>
                {showAscii && (
                  <td className={`px-2 py-0.5 ${textDataYellow} break-all ${cellHighlight}`}>
                    |{bytesToAscii(frame.bytes)}|
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {frames.length === 0 ? (
        <div className={emptyStateContainer}>
          <p className={emptyStateText}>{emptyMessage}</p>
        </div>
      ) : (
        <div style={{ height: RESERVED_PX }} />
      )}
    </div>
  );
});

FrameDataTable.displayName = 'FrameDataTable';

export default FrameDataTable;
