// ui/src/components/DataViewTabBar.tsx
//
// Shared tab bar component for data views (Discovery, Decoder, etc.).
// Provides consistent dark-themed tabbed interface with status display and controls.

import { ReactNode } from 'react';
import { Clock, History } from 'lucide-react';
import {
  bgDarkToolbar,
  borderDarkView,
  textDarkMuted,
} from '../styles';
import {
  dataViewTabClass,
  badgeColorClass,
  tabCountColorClass,
} from '../styles/buttonStyles';

// ============================================================================
// Types
// ============================================================================

export type StreamingStatus = 'stopped' | 'live' | 'paused';

export interface TabDefinition {
  id: string;
  label: string;
  count?: number;
  countColor?: 'green' | 'gray' | 'purple' | 'orange';
  /** Optional prefix to show before count (e.g., ">" for truncated buffers) */
  countPrefix?: string;
  /** Show purple dot indicator when true and tab is not active */
  hasIndicator?: boolean;
}

/** Badge to display next to the protocol label */
export interface ProtocolBadge {
  label: string;
  color?: 'green' | 'blue' | 'purple' | 'gray' | 'amber' | 'cyan';
}

export interface DataViewTabBarProps {
  /** Tab definitions */
  tabs: TabDefinition[];
  /** Currently active tab ID */
  activeTab: string;
  /** Called when a tab is clicked */
  onTabChange: (tabId: string) => void;

  /** Protocol or mode label shown on the left */
  protocolLabel: string;
  /** Optional badges to show next to the protocol label (e.g., framing mode, filter) */
  protocolBadges?: ProtocolBadge[];
  /** Streaming status: 'stopped' (red), 'live' (green), or 'paused' (orange) */
  status?: StreamingStatus;
  /** @deprecated Use status instead. Whether data is currently streaming */
  isStreaming?: boolean;
  /** Current timestamp display (optional) */
  displayTime?: string | null;
  /** Whether the data source is recorded (e.g., PostgreSQL, CSV) vs live */
  isRecorded?: boolean;

  /** Additional control buttons rendered on the right */
  controls?: ReactNode;
}

// ============================================================================
// Status Light Component
// ============================================================================

function StatusLight({ status }: { status: StreamingStatus }) {
  const colorClass = status === 'live'
    ? 'bg-green-500'
    : status === 'paused'
    ? 'bg-orange-500'
    : 'bg-red-500';

  return (
    <span
      className={`w-2 h-2 rounded-full ${colorClass}`}
      title={status === 'live' ? 'Live' : status === 'paused' ? 'Paused' : 'Stopped'}
    />
  );
}

// ============================================================================
// Component
// ============================================================================

export default function DataViewTabBar({
  tabs,
  activeTab,
  onTabChange,
  protocolLabel,
  protocolBadges,
  status,
  isStreaming,
  displayTime,
  isRecorded = false,
  controls,
}: DataViewTabBarProps) {
  // Support both new status prop and legacy isStreaming prop
  const effectiveStatus: StreamingStatus = status ?? (isStreaming ? 'live' : 'stopped');

  return (
    <div className={`flex-shrink-0 flex items-center border-b ${borderDarkView} ${bgDarkToolbar}`}>
      {/* Protocol badge with status light */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 ml-1 rounded bg-gray-700/50"
        title={isRecorded ? 'Recorded data source' : 'Live data source'}
      >
        <StatusLight status={effectiveStatus} />
        <span className="text-xs font-medium text-gray-300">{protocolLabel}</span>
        {isRecorded && (
          <History className={`w-3 h-3 ${textDarkMuted}`} />
        )}
      </div>

      {/* Protocol configuration badges (framing, filter, etc.) */}
      {protocolBadges && protocolBadges.length > 0 && protocolBadges.map((badge, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-1 ml-1 px-2 py-0.5 rounded text-xs ${badgeColorClass(badge.color ?? 'gray')}`}
        >
          {badge.label}
        </div>
      ))}

      {/* Time display as badge */}
      {displayTime && (
        <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded bg-gray-700/50 text-xs text-gray-300">
          <Clock className="w-3 h-3" />
          <span className="font-mono">{displayTime}</span>
        </div>
      )}

      {/* Tabs */}
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={dataViewTabClass(isActive, tab.hasIndicator)}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`ml-1.5 text-xs ${tabCountColorClass(tab.countColor ?? 'gray')}`}>
                ({tab.countPrefix ?? ''}{tab.count.toLocaleString()})
              </span>
            )}
            {tab.hasIndicator && !isActive && (
              <span className="ml-1 w-1.5 h-1.5 bg-purple-500 rounded-full inline-block" />
            )}
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Control Buttons */}
      {controls && (
        <div className="flex items-center gap-1.5 px-2">
          {controls}
        </div>
      )}
    </div>
  );
}
