// ui/src/styles/typography.ts
//
// Centralized typography styles for consistent text presentation.

// =============================================================================
// Headings
// =============================================================================

/** Page title (h1) */
export const h1 = "text-2xl font-bold text-slate-900 dark:text-white";

/** Section title (h2) */
export const h2 = "text-xl font-semibold text-slate-900 dark:text-white";

/** Subsection title (h3) */
export const h3 = "text-lg font-semibold text-slate-900 dark:text-white";

/** Card/dialog title (h4) */
export const h4 = "text-base font-medium text-slate-900 dark:text-white";

// =============================================================================
// Body Text
// =============================================================================

/** Default body text */
export const bodyDefault = "text-sm text-slate-700 dark:text-slate-300";

/** Large body text */
export const bodyLarge = "text-base text-slate-700 dark:text-slate-300";

/** Small body text */
export const bodySmall = "text-xs text-slate-600 dark:text-slate-400";

// =============================================================================
// Utility Text
// =============================================================================

/** Monospace/code text */
export const mono = "font-mono text-sm";

/** Caption text */
export const caption = "text-xs text-slate-500 dark:text-slate-400";

/** Emphasized text */
export const emphasis = "font-medium text-slate-900 dark:text-white";

// =============================================================================
// Truncation Helpers
// =============================================================================

/** Single line truncation */
export const truncate = "truncate";

/** Multi-line clamp (2 lines) */
export const lineClamp2 = "line-clamp-2";

/** Multi-line clamp (3 lines) */
export const lineClamp3 = "line-clamp-3";
