// ui/src/apps/discovery/views/serial/TabBar.tsx
//
// Tab bar with controls for the serial discovery view.
// Uses the shared DiscoveryTabBar with serial-specific controls.

import { useMemo } from 'react';
import { Layers, Filter, Settings } from 'lucide-react';
import { DiscoveryTabBar, type TabDefinition } from '../../components';
import type { FramingConfig } from '../../../../stores/discoveryStore';

export type TabId = 'raw' | 'framed' | 'analysis';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  frameCount: number;
  byteCount: number;
  framingConfig: FramingConfig | null;
  /** Independent minimum frame length filter (0 = no filter) */
  minFrameLength: number;
  hasAnalysisResults: boolean;
  isStreaming?: boolean;
  isRecorded?: boolean;
  onOpenRawBytesViewDialog: () => void;
  onOpenFramingDialog: () => void;
  onOpenFilterDialog: () => void;
  /** Whether framing has been accepted - hides Raw Bytes tab when true */
  framingAccepted?: boolean;
}

export default function TabBar({
  activeTab,
  onTabChange,
  frameCount,
  byteCount,
  framingConfig,
  minFrameLength,
  hasAnalysisResults,
  isStreaming = false,
  isRecorded = false,
  onOpenRawBytesViewDialog,
  onOpenFramingDialog,
  onOpenFilterDialog,
  framingAccepted = false,
}: TabBarProps) {
  const getFramingLabel = () => {
    if (!framingConfig) return 'Framing';
    switch (framingConfig.mode) {
      case 'slip': return 'SLIP';
      case 'raw': return 'Delimiter';
      case 'modbus_rtu': return 'Modbus';
    }
  };

  // Build tab definitions - hide Raw Bytes tab after framing is accepted
  const tabs: TabDefinition[] = useMemo(() => {
    const result: TabDefinition[] = [];

    // Only show Raw Bytes tab if framing hasn't been accepted yet
    if (!framingAccepted) {
      result.push({ id: 'raw', label: 'Raw Bytes', count: byteCount, countColor: 'gray' as const });
    }

    result.push({ id: 'framed', label: 'Framed Data', count: frameCount, countColor: 'green' as const });
    result.push({ id: 'analysis', label: 'Analysis', hasIndicator: hasAnalysisResults });

    return result;
  }, [byteCount, frameCount, hasAnalysisResults, framingAccepted]);

  // Serial-specific control buttons (compact styling)
  // Only show controls on raw and framed tabs, not on analysis tab
  const serialControls = (activeTab === 'raw' || activeTab === 'framed') ? (
    <>
      {/* View settings - only on raw bytes tab */}
      {activeTab === 'raw' && (
        <button
          onClick={onOpenRawBytesViewDialog}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
          title="Configure raw bytes display"
        >
          <Settings className="w-3 h-3" />
          View
        </button>
      )}

      <button
        onClick={onOpenFramingDialog}
        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
          framingConfig
            ? 'bg-blue-600 text-white hover:bg-blue-500'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
        title="Configure framing mode"
      >
        <Layers className="w-3 h-3" />
        {getFramingLabel()}
      </button>

      {/* Filter button - only on framed tab (filtering applies to frames, not bytes) */}
      {activeTab === 'framed' && (
        <button
          onClick={onOpenFilterDialog}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
            minFrameLength > 0
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title="Configure frame filters"
        >
          <Filter className="w-3 h-3" />
          {minFrameLength > 0 ? `${minFrameLength}+` : 'All'}
        </button>
      )}
    </>
  ) : null;

  return (
    <DiscoveryTabBar
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => onTabChange(id as TabId)}
      protocolLabel="Serial"
      isStreaming={isStreaming}
      isRecorded={isRecorded}
      controls={serialControls}
    />
  );
}
