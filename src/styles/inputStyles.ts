// ui/src/styles/inputStyles.ts
// Centralized input and form field styles for consistent appearance across the app

/**
 * Base input styles - common to all input variants
 */
export const inputBase = "w-full border transition-colors text-slate-900 dark:text-white";

/**
 * Default input style - full styling with focus ring
 * Use for: Settings, IOProfile dialogs, main forms
 */
export const inputDefault = `${inputBase} px-4 py-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`;

/**
 * Simple input style - minimal styling
 * Use for: SaveFrames dialogs, compact forms
 */
export const inputSimple = `${inputBase} px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500`;

/**
 * Toolbar select - dark theme for data view bars
 * Use for: Pagination toolbars, data view controls
 */
export const toolbarSelect = "text-xs px-2 py-1 rounded border border-gray-600 bg-gray-700 text-gray-200 focus:outline-none";

/**
 * Default label style - block layout with medium font
 * Use for: Settings forms, main dialogs
 */
export const labelDefault = "block text-sm font-medium text-slate-900 dark:text-white mb-2";

/**
 * Simple label style - inline with smaller text
 * Use for: Compact forms, simple dialogs
 */
export const labelSimple = "text-sm text-slate-700 dark:text-slate-200";

/**
 * Small label style - tiny text for field groups
 * Use for: Field groups, secondary labels
 */
export const labelSmall = "text-xs font-medium text-slate-600 dark:text-slate-400";

/**
 * Help text style - description text below inputs
 */
export const helpText = "text-xs text-slate-500 dark:text-slate-400";

/**
 * Select base style - matches input default
 */
export const selectDefault = `${inputBase} px-4 py-2 bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`;

/**
 * Select simple style - matches input simple
 */
export const selectSimple = `${inputBase} px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500`;
