// ui/src/styles/colorTokens.ts
//
// Centralized color tokens for consistent palette across the app.
// These map to Tailwind color classes but provide semantic meaning.

// =============================================================================
// Semantic Background Colors
// =============================================================================

/** Primary surface (main app background) */
export const bgPrimary = "bg-white dark:bg-slate-900";

/** Secondary surface (cards, panels) */
export const bgSecondary = "bg-slate-50 dark:bg-slate-800";

/** Tertiary surface (inputs, nested elements) */
export const bgTertiary = "bg-slate-100 dark:bg-slate-700";

/** Muted background (disabled, inactive) */
export const bgMuted = "bg-slate-200 dark:bg-slate-700";

// =============================================================================
// Semantic Text Colors
// =============================================================================

/** Primary text (headings, main content) */
export const textPrimary = "text-slate-900 dark:text-white";

/** Secondary text (descriptions, labels) */
export const textSecondary = "text-slate-700 dark:text-slate-300";

/** Tertiary text (hints, help text) */
export const textTertiary = "text-slate-500 dark:text-slate-400";

/** Muted text (disabled, placeholder) */
export const textMuted = "text-slate-400 dark:text-slate-500";

// =============================================================================
// Semantic Border Colors
// =============================================================================

/** Default border */
export const borderDefault = "border-slate-200 dark:border-slate-700";

/** Strong border (focus, emphasis) */
export const borderStrong = "border-slate-300 dark:border-slate-600";

/** Subtle border (dividers) */
export const borderSubtle = "border-slate-100 dark:border-slate-800";

// =============================================================================
// Status Colors (backgrounds)
// =============================================================================

/** Success background */
export const bgSuccess = "bg-green-100 dark:bg-green-900/30";

/** Danger/error background */
export const bgDanger = "bg-red-100 dark:bg-red-900/30";

/** Warning background */
export const bgWarning = "bg-amber-100 dark:bg-amber-900/30";

/** Info background */
export const bgInfo = "bg-blue-100 dark:bg-blue-900/30";

// =============================================================================
// Status Colors (text)
// =============================================================================

/** Success text */
export const textSuccess = "text-green-700 dark:text-green-300";

/** Danger/error text */
export const textDanger = "text-red-700 dark:text-red-300";

/** Warning text */
export const textWarning = "text-amber-700 dark:text-amber-300";

/** Info text */
export const textInfo = "text-blue-700 dark:text-blue-300";

// =============================================================================
// Status Colors (borders)
// =============================================================================

/** Success border */
export const borderSuccess = "border-green-200 dark:border-green-800";

/** Danger/error border */
export const borderDanger = "border-red-200 dark:border-red-800";

/** Warning border */
export const borderWarning = "border-amber-200 dark:border-amber-800";

/** Info border */
export const borderInfo = "border-blue-200 dark:border-blue-800";

// =============================================================================
// Interactive Colors
// =============================================================================

/** Primary action (buttons, links) */
export const bgInteractive = "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500";

/** Primary action text */
export const textInteractive = "text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";

/** Focus ring */
export const focusRing = "focus:ring-2 focus:ring-blue-500 focus:outline-none";

// =============================================================================
// Toolbar/Dark Theme Colors (for data view toolbars)
// =============================================================================

/** Dark toolbar background */
export const bgToolbar = "bg-gray-800";

/** Dark toolbar text */
export const textToolbar = "text-gray-200";

/** Dark toolbar border */
export const borderToolbar = "border-gray-600";

/** Dark toolbar input */
export const bgToolbarInput = "bg-gray-700";

// =============================================================================
// Hover States
// =============================================================================

/** Light hover (for light backgrounds) */
export const hoverLight = "hover:bg-slate-100 dark:hover:bg-slate-700";

/** Subtle hover (for secondary surfaces) */
export const hoverSubtle = "hover:bg-slate-200 dark:hover:bg-slate-600";

// =============================================================================
// Dark Data View Colors (for Discovery, Decoder tables)
// =============================================================================

/** Dark view container background */
export const bgDarkView = "bg-gray-900";

/** Dark view toolbar background */
export const bgDarkToolbar = "bg-gray-800";

/** Dark view border */
export const borderDarkView = "border-gray-700";

/** Dark view input background */
export const bgDarkInput = "bg-gray-700";

/** Dark view input text */
export const textDarkInput = "text-gray-200";

/** Dark view muted text */
export const textDarkMuted = "text-gray-400";

/** Dark view subtle text */
export const textDarkSubtle = "text-gray-500";

/** Dark view hover */
export const hoverDark = "hover:bg-gray-700";

/** Dark view row hover */
export const hoverDarkRow = "hover:bg-gray-800";

// Data colors for table cells
export const textDataGreen = "text-green-400";
export const textDataYellow = "text-yellow-400";
export const textDataOrange = "text-orange-400";
export const textDataPurple = "text-purple-400";
export const textDataAmber = "text-amber-500";
export const textDataCyan = "text-cyan-400";
