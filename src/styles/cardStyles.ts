// ui/src/styles/cardStyles.ts
// Centralized card, panel, and container styles

/**
 * Card base - common border and rounding
 */
export const cardBase = "rounded-lg border";

/**
 * Default card - subtle background for content sections
 * Use for: Content panels, form sections
 */
export const cardDefault = `${cardBase} bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700`;

/**
 * Elevated card - white background with subtle shadow
 * Use for: Floating panels, prominent content
 */
export const cardElevated = `${cardBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm`;

/**
 * Interactive card - hover state for clickable cards
 * Use for: List items, selectable cards
 */
export const cardInteractive = `${cardBase} bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-colors`;

/**
 * Alert base - common alert box styles
 */
export const alertBase = "rounded-lg p-4 border";

/**
 * Info alert - blue, for informational messages
 */
export const alertInfo = `${alertBase} bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800`;

/**
 * Warning alert - amber, for warning messages
 */
export const alertWarning = `${alertBase} bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800`;

/**
 * Danger alert - red, for error messages
 */
export const alertDanger = `${alertBase} bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800`;

/**
 * Success alert - green, for success messages
 */
export const alertSuccess = `${alertBase} bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800`;

/**
 * Detail box - for technical details, code blocks
 * Use for: Error details, code previews
 */
export const detailBox = "bg-slate-100 dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700";

/**
 * Padding sizes for cards
 */
export const cardPadding = {
  none: "",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
};

/**
 * Compact error box - red, small text
 * Use for: Inline error messages in forms/dialogs
 */
export const errorBoxCompact = "p-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded";

/**
 * Panel footer - for action button containers
 * Use for: Bottom section of dialogs/panels with action buttons
 */
export const panelFooter = "p-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700";
