// ui/src/apps/graph/views/GraphTopBar.tsx

import { BarChart3, Plus, LineChart, Gauge } from "lucide-react";
import AppTopBar from "../../../components/AppTopBar";
import { buttonBase } from "../../../styles/buttonStyles";
import { iconSm } from "../../../styles/spacing";
import { textSecondary } from "../../../styles/colourTokens";
import { useGraphStore } from "../../../stores/graphStore";
import { useState, useRef, useEffect } from "react";
import type { PanelType } from "../../../stores/graphStore";
import type { IOProfile } from "../../../types/common";
import type { CatalogMetadata } from "../../../api/catalog";

interface Props {
  // IO session
  ioProfile: string | null;
  ioProfiles: IOProfile[];
  multiBusProfiles?: string[];
  defaultReadProfileId?: string | null;
  sessionId?: string | null;
  ioState?: string | null;
  isStreaming: boolean;
  isStopped?: boolean;
  supportsTimeRange?: boolean;
  onStop?: () => void;
  onResume?: () => void;
  onLeave?: () => void;
  onOpenIoReaderPicker: () => void;

  // Catalog
  catalogs: CatalogMetadata[];
  catalogPath: string | null;
  defaultCatalogFilename?: string | null;
  onOpenCatalogPicker: () => void;

  // Watch state (for frame count display)
  isWatching: boolean;
  watchFrameCount: number;
}

export default function GraphTopBar({
  ioProfile,
  ioProfiles,
  multiBusProfiles,
  defaultReadProfileId,
  sessionId,
  ioState,
  isStreaming,
  isStopped,
  supportsTimeRange,
  onStop,
  onResume,
  onLeave,
  onOpenIoReaderPicker,
  catalogs,
  catalogPath,
  defaultCatalogFilename,
  onOpenCatalogPicker,
  isWatching,
  watchFrameCount,
}: Props) {
  const addPanel = useGraphStore((s) => s.addPanel);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addMenuOpen]);

  const handleAddPanel = (type: PanelType) => {
    addPanel(type);
    setAddMenuOpen(false);
  };

  return (
    <AppTopBar
      icon={BarChart3}
      iconColour="text-pink-400"
      ioSession={{
        ioProfile,
        ioProfiles,
        multiBusProfiles,
        defaultReadProfileId,
        sessionId,
        ioState,
        onOpenIoReaderPicker,
        isStreaming,
        isStopped,
        supportsTimeRange,
        onStop,
        onResume,
        onLeave,
      }}
      catalog={{
        catalogs,
        catalogPath,
        defaultCatalogFilename,
        onOpen: onOpenCatalogPicker,
      }}
      actions={
        isWatching && watchFrameCount > 0 ? (
          <span className={`text-xs ${textSecondary}`}>
            {watchFrameCount.toLocaleString()} frames
          </span>
        ) : undefined
      }
    >
      {/* Add panel button with dropdown */}
      <div ref={addMenuRef} className="relative">
        <button
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className={`${buttonBase} px-2 py-1 text-xs gap-1`}
          title="Add panel"
        >
          <Plus className={iconSm} />
          Add Panel
        </button>
        {addMenuOpen && (
          <div className="absolute top-full left-0 mt-1 py-1 min-w-[140px] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg shadow-xl z-50">
            <button
              onClick={() => handleAddPanel('line-chart')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[color:var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              <LineChart className={iconSm} />
              Line Chart
            </button>
            <button
              onClick={() => handleAddPanel('gauge')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[color:var(--text-primary)] hover:bg-[var(--hover-bg)] transition-colors"
            >
              <Gauge className={iconSm} />
              Gauge
            </button>
          </div>
        )}
      </div>
    </AppTopBar>
  );
}
