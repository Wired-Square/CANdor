// ui/src/components/AppLayout.tsx

import { ReactNode } from "react";

type AppLayoutProps = {
  topBar: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  sidebarWidth?: string;
};

/**
 * Standard app layout with:
 * - Static top bar (never scrolls)
 * - Optional sidebar (scrolls independently)
 * - Main content area (scrolls independently)
 */
export default function AppLayout({
  topBar,
  sidebar,
  children,
  sidebarWidth = "w-72",
}: AppLayoutProps) {
  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Static top bar */}
      {topBar}

      {/* Body: sidebar + main content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar - scrolls independently */}
        {sidebar && (
          <aside
            className={`${sidebarWidth} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden`}
          >
            <div className="flex-1 overflow-y-auto overscroll-none">{sidebar}</div>
          </aside>
        )}

        {/* Main content - scrolls independently */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto overscroll-none">{children}</div>
        </main>
      </div>
    </div>
  );
}
