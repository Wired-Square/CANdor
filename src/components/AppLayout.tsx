// ui/src/components/AppLayout.tsx
//
// Standardised outer layout component for apps. Provides consistent container
// structure with theme support and content margin for the bubble effect.

import { type ReactNode } from "react";
import { bgDarkView } from "../styles/colourTokens";

interface AppLayoutProps {
  /** Top bar content (rendered via AppTopBar or custom) */
  topBar: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Theme: 'auto' (light/dark) or 'dark' (always dark like Transmit) */
  theme?: "auto" | "dark";
  /** Add m-2 margin around content for bubble effect (default: true) */
  contentMargin?: boolean;
}

/**
 * Standardised outer layout component for apps.
 *
 * Provides:
 * - Full-height flex column container
 * - Theme support (auto light/dark or always dark)
 * - Optional margin around content for bubble effect
 *
 * @example
 * ```tsx
 * <AppLayout topBar={<AppTopBar icon={Search} ... />}>
 *   <AppTabView ...>
 *     {content}
 *   </AppTabView>
 * </AppLayout>
 * ```
 */
export default function AppLayout({
  topBar,
  children,
  theme = "auto",
  contentMargin = true,
}: AppLayoutProps) {
  const bgClass =
    theme === "dark" ? bgDarkView : "bg-slate-50 dark:bg-slate-900";

  return (
    <div className={`h-full flex flex-col ${bgClass} overflow-hidden`}>
      {topBar}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden ${contentMargin ? "m-2" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
