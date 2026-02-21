// ui/src/apps/graph/views/panels/PanelWrapper.tsx

import { type ReactNode, useRef, useCallback, useEffect } from "react";
import { X, Settings2, Plus, Copy, Maximize2, ChevronsRight, BarChart2, Download } from "lucide-react";
import { iconSm } from "../../../../styles/spacing";
import { iconButtonHover, iconButtonHoverDanger } from "../../../../styles/buttonStyles";
import { useGraphStore, type GraphPanel } from "../../../../stores/graphStore";

/** Compact toggle button for the panel icon bar (p-0.5 sizing). */
function compactToggle(isActive: boolean, colour: "blue" | "purple"): string {
  if (isActive) {
    const bg = colour === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-purple-600 hover:bg-purple-700";
    return `p-0.5 rounded transition-colors ${bg} text-white`;
  }
  return `p-0.5 rounded transition-colors ${iconButtonHover}`;
}

/** Distance threshold (px) to distinguish a click from a drag. */
const DRAG_THRESHOLD = 5;

interface Props {
  panel: GraphPanel;
  onOpenSignalPicker: () => void;
  onOpenPanelConfig: () => void;
  onExport?: () => void;
  children: ReactNode;
}

export default function PanelWrapper({ panel, onOpenSignalPicker, onOpenPanelConfig, onExport, children }: Props) {
  const clonePanel = useGraphStore((s) => s.clonePanel);
  const removePanel = useGraphStore((s) => s.removePanel);
  const triggerZoomReset = useGraphStore((s) => s.triggerZoomReset);
  const setFollowMode = useGraphStore((s) => s.setFollowMode);
  const toggleStats = useGraphStore((s) => s.toggleStats);

  const isLineChart = panel.type === "line-chart";
  const followMode = panel.followMode !== false;

  // Track whether a drag-relocate occurred to suppress button clicks.
  // react-grid-layout uses mousemove-based dragging (not native HTML5 drag),
  // so we detect movement via document-level mousemove listeners.
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    didDragRef.current = false;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDownPos.current || didDragRef.current) return;
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        didDragRef.current = true;
      }
    };
    const onMouseUp = () => {
      mouseDownPos.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /** Capture-phase handler on the icon bar — suppresses all button clicks after a drag. */
  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (didDragRef.current) {
      e.stopPropagation();
      e.preventDefault();
      didDragRef.current = false;
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg overflow-hidden">
      {/* Header — drag handle; icon bar hidden until header hover */}
      <div
        className="group/header drag-handle cursor-grab active:cursor-grabbing select-none border-b border-[var(--border-default)] bg-[var(--bg-primary)]"
        onMouseDown={handleMouseDown}
      >
        {/* Icon bar — collapsed by default, revealed on header hover */}
        <div className="grid grid-rows-[0fr] group-hover/header:grid-rows-[1fr] transition-[grid-template-rows] duration-150">
          <div className="overflow-hidden">
            <div
              className="flex items-center justify-end gap-0.5 px-1.5 py-0.5"
              onClickCapture={handleClickCapture}
            >
              {/* Signal count badge */}
              {panel.signals.length > 0 && (
                <span
                  className="w-4 h-4 rounded-full text-[10px] font-medium tabular-nums flex items-center justify-center shrink-0 bg-[var(--border-default)] text-[color:var(--text-secondary)]"
                  title={`${panel.signals.length} signal${panel.signals.length !== 1 ? "s" : ""}`}
                >
                  {panel.signals.length}
                </span>
              )}

              {/* Line-chart-specific controls */}
              {isLineChart && (
                <>
                  {/* Follow mode toggle */}
                  <button
                    onClick={() => setFollowMode(panel.id, !followMode)}
                    className={compactToggle(followMode, "blue")}
                    title={followMode ? "Following latest data (click to disable)" : "Follow latest data"}
                  >
                    <ChevronsRight className={iconSm} />
                  </button>

                  {/* Stats toggle */}
                  <button
                    onClick={() => toggleStats(panel.id)}
                    className={compactToggle(panel.showStats === true, "purple")}
                    title={panel.showStats ? "Hide statistics" : "Show statistics (min/avg/max)"}
                  >
                    <BarChart2 className={iconSm} />
                  </button>

                  {/* Reset zoom */}
                  <button
                    onClick={triggerZoomReset}
                    className={`p-0.5 rounded ${iconButtonHover}`}
                    title="Reset zoom"
                  >
                    <Maximize2 className={iconSm} />
                  </button>
                </>
              )}

              {/* Export data */}
              {onExport && (
                <button
                  onClick={onExport}
                  className={`p-0.5 rounded ${iconButtonHover}`}
                  title="Export data as CSV"
                >
                  <Download className={iconSm} />
                </button>
              )}

              {/* Add signal */}
              <button
                onClick={onOpenSignalPicker}
                className={`p-0.5 rounded ${iconButtonHover}`}
                title="Add signals"
              >
                <Plus className={iconSm} />
              </button>

              {/* Configure */}
              <button
                onClick={onOpenPanelConfig}
                className={`p-0.5 rounded ${iconButtonHover}`}
                title="Configure panel"
              >
                <Settings2 className={iconSm} />
              </button>

              {/* Clone */}
              <button
                onClick={() => clonePanel(panel.id)}
                className={`p-0.5 rounded ${iconButtonHover}`}
                title="Clone panel"
              >
                <Copy className={iconSm} />
              </button>

              {/* Close */}
              <button
                onClick={() => removePanel(panel.id)}
                className={`p-0.5 rounded ${iconButtonHoverDanger}`}
                title="Remove panel"
              >
                <X className={iconSm} />
              </button>
            </div>
          </div>
        </div>

        {/* Title — always visible */}
        <div className="px-2 py-0.5 text-xs font-medium text-[color:var(--text-primary)] truncate">
          {panel.title}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
