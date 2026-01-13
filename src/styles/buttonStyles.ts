// ui/src/styles/buttonStyles.ts
// Centralized button styles for consistent appearance across the app

/**
 * Base button with text - grey background, used for most toolbar buttons
 * Use for buttons that contain text and/or icons
 */
export const buttonBase =
  "flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0";

/**
 * Icon-only button - grey background, centered icon
 * Use for buttons that contain only an icon (no text)
 */
export const iconButtonBase =
  "flex items-center justify-center px-2 py-1.5 rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0";

/**
 * Danger/Stop button - red background, icon only
 * Use for stop/cancel actions
 */
export const dangerButtonBase =
  "flex items-center justify-center px-2 py-1.5 rounded transition-colors bg-red-600 hover:bg-red-700 text-white shrink-0";

/**
 * Warning/Detach button - amber background, icon only
 * Use for detach/disconnect actions
 */
export const warningButtonBase =
  "flex items-center justify-center px-2 py-1.5 rounded transition-colors bg-amber-600 hover:bg-amber-700 text-white shrink-0";

/**
 * Success icon button - green background, icon only (matches dangerButtonBase sizing)
 * Use for resume/play actions in toolbars
 */
export const successIconButton =
  "flex items-center justify-center px-2 py-1.5 rounded transition-colors bg-green-600 hover:bg-green-700 text-white shrink-0";

/**
 * Toggle button helper - returns appropriate classes based on active state
 * @param isActive - Whether the toggle is currently active
 * @param activeColor - The color when active (default: purple)
 */
export function toggleButtonClass(isActive: boolean, activeColor: "purple" | "yellow" | "blue" = "purple"): string {
  const baseClasses = "flex items-center justify-center px-2 py-1.5 rounded transition-colors shrink-0";

  if (isActive) {
    const colorMap = {
      purple: "bg-purple-600 hover:bg-purple-700 text-white",
      yellow: "bg-yellow-600 hover:bg-yellow-500 text-white",
      blue: "bg-blue-600 hover:bg-blue-700 text-white",
    };
    return `${baseClasses} ${colorMap[activeColor]}`;
  }

  return `${baseClasses} bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600`;
}

/**
 * Play/Resume button - green background
 * Use for: Start/Resume playback actions
 */
export const playButtonBase =
  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed";

/**
 * Pause button - yellow/amber background
 * Use for: Pause playback actions
 */
export const pauseButtonBase =
  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors bg-yellow-500 text-white hover:bg-yellow-600";

/**
 * Stop button - red background
 * Use for: Stop/Cancel playback actions
 */
export const stopButtonBase =
  "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed";

/**
 * Compact play button - smaller padding for compact layouts
 */
export const playButtonCompact =
  "flex items-center gap-2 px-2 py-1 rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed";

/**
 * Compact pause button - smaller padding for compact layouts
 */
export const pauseButtonCompact =
  "flex items-center gap-2 px-2 py-1 rounded-lg transition-colors bg-yellow-500 text-white hover:bg-yellow-600";

/**
 * Compact stop button - smaller padding for compact layouts
 */
export const stopButtonCompact =
  "flex items-center gap-2 px-2 py-1 rounded-lg transition-colors bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed";

/**
 * Primary action button - blue background
 * Use for: Primary actions in dialogs (Import, Watch, OK)
 */
export const primaryButtonBase =
  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed";

/**
 * Success action button - green background
 * Use for: Positive actions (Ingest, Confirm)
 */
export const successButtonBase =
  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors bg-green-600 text-white hover:bg-green-700";

/**
 * Toggle card button for dark panels (e.g., framing options in dark dialogs)
 * @param isActive - Whether the toggle is currently active
 */
export function toggleCardClass(isActive: boolean): string {
  const base = "w-full text-left px-4 py-3 rounded border transition-colors";
  return isActive
    ? `${base} bg-blue-900/30 border-blue-600 text-white`
    : `${base} bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600`;
}

/**
 * Toggle chip button for light/dark mode panels
 * @param isActive - Whether the toggle is currently active
 */
export function toggleChipClass(isActive: boolean): string {
  const base = "px-3 py-1.5 text-xs rounded border transition-colors";
  return isActive
    ? `${base} bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300`
    : `${base} bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500`;
}

/**
 * Selection button for dialog options (teal-themed)
 * @param isActive - Whether the option is currently selected
 */
export function selectionButtonClass(isActive: boolean): string {
  const base = "px-3 py-2 rounded border text-sm font-medium transition-colors";
  return isActive
    ? `${base} border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-200`
    : `${base} border-slate-300 dark:border-slate-600 hover:border-teal-400 text-slate-700 dark:text-slate-300`;
}

/**
 * Group selection button with ring indicator
 * @param isActive - Whether the option is currently selected
 */
export function groupButtonClass(isActive: boolean): string {
  const base = "flex items-center justify-center px-2 py-1.5 text-sm rounded transition-colors shrink-0";
  return isActive
    ? `${base} bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-800`
    : `${base} bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600`;
}

// =============================================================================
// Dark Data View Styles (for Discovery, Decoder data tables)
// =============================================================================

/**
 * Pagination button - dark themed for data views
 */
export const paginationButtonDark =
  "p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed";

/**
 * Tab button for dark data views
 * @param isActive - Whether the tab is currently active
 * @param hasIndicator - Whether to show purple indicator (for tabs with new data)
 */
export function dataViewTabClass(isActive: boolean, hasIndicator = false): string {
  const base = "px-3 py-1.5 text-xs font-medium border-b-2 transition-colors";
  if (isActive) {
    return `${base} text-blue-400 border-blue-400`;
  }
  if (hasIndicator) {
    return `${base} text-purple-400 border-transparent hover:text-purple-300`;
  }
  return `${base} text-gray-400 border-transparent hover:text-gray-200`;
}

/**
 * Get badge color classes for protocol badges (dark theme)
 * @param color - Badge color variant
 */
export function badgeColorClass(color: 'green' | 'blue' | 'purple' | 'gray' | 'amber' | 'cyan'): string {
  const colorMap = {
    green: 'bg-green-600/30 text-green-400',
    blue: 'bg-blue-600/30 text-blue-400',
    purple: 'bg-purple-600/30 text-purple-400',
    gray: 'bg-gray-600/30 text-gray-400',
    amber: 'bg-amber-600/30 text-amber-400',
    cyan: 'bg-cyan-600/30 text-cyan-400',
  };
  return colorMap[color];
}

/**
 * Get count color class for tab counts
 */
export function tabCountColorClass(color: 'green' | 'purple' | 'gray' | 'orange'): string {
  const colorMap = {
    green: 'text-green-500',
    purple: 'text-purple-500',
    gray: 'text-gray-500',
    orange: 'text-orange-500',
  };
  return colorMap[color];
}

/**
 * Small icon button for tables (dark theme) - bookmark, calculator buttons
 */
export const tableIconButtonDark =
  "p-0.5 rounded hover:bg-gray-700 transition-colors";
