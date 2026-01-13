// ui/src/components/ResizableSidebar.tsx

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  position?: "left" | "right";
  className?: string;
  collapsible?: boolean;
};

export default function ResizableSidebar({
  children,
  defaultWidth = 256,
  minWidth = 180,
  maxWidth = 500,
  position = "left",
  className = "",
  collapsible = false,
}: Props) {
  const [width, setWidth] = useState(defaultWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;

      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      let newWidth: number;

      if (position === "left") {
        newWidth = e.clientX - sidebarRect.left;
      } else {
        newWidth = sidebarRect.right - e.clientX;
      }

      // Clamp to min/max
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
    },
    [isResizing, minWidth, maxWidth, position]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add/remove global event listeners for drag
  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Add class to body to prevent text selection during resize
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const borderClass = position === "left" ? "border-r" : "border-l";
  const collapsedWidth = 24; // Width of the collapsed sliver

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Determine which chevron to show based on position and collapsed state
  const CollapseIcon = position === "left"
    ? (isCollapsed ? ChevronRight : ChevronLeft)
    : (isCollapsed ? ChevronLeft : ChevronRight);

  return (
    <aside
      ref={sidebarRef}
      style={{ width: isCollapsed ? collapsedWidth : width }}
      className={`relative flex flex-col bg-white dark:bg-slate-800 ${borderClass} border-slate-200 dark:border-slate-700 transition-[width] duration-200 ${className}`}
    >
      {/* Collapsed state - just show expand button */}
      {isCollapsed ? (
        <button
          onClick={handleToggleCollapse}
          className="flex-1 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          title="Expand sidebar"
        >
          <CollapseIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>
      ) : (
        <>
          {children}

          {/* Collapse button - shown at top right when collapsible */}
          {collapsible && (
            <button
              onClick={handleToggleCollapse}
              className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors z-20"
              title="Collapse sidebar"
            >
              <CollapseIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>
          )}

          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`
              absolute top-0 bottom-0 w-1.5 z-10
              cursor-col-resize
              transition-colors duration-150
              hover:bg-blue-500/60
              ${isResizing ? "bg-blue-500/60" : "bg-transparent"}
              ${position === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2"}
            `}
          />
        </>
      )}
    </aside>
  );
}
