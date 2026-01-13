// Hook for automatic window geometry persistence

import { useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { windowManager } from '../managers/WindowManager';
import type { WindowLabel } from '../utils/windows';

/**
 * Hook to automatically save window geometry on resize/move
 *
 * IMPORTANT: We do NOT save geometry in onCloseRequested because:
 * 1. Async operations during window close race with WebView destruction
 * 2. This causes crashes in WebKit::WebPageProxy::dispatchSetObscuredContentInsets()
 *    on macOS 26.2 (Tahoe) and later
 * 3. The debounced saves on resize/move are sufficient for persistence
 *
 * @param label - Window label for this window
 */
export function useWindowPersistence(label: WindowLabel) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowSavingRef = useRef(false);
  const isClosingRef = useRef(false);

  useEffect(() => {
    console.log(`[useWindowPersistence] Setting up persistence for ${label}`);
    const currentWindow = getCurrentWebviewWindow();

    // Don't save geometry changes for the first 2 seconds after window creation
    // This prevents saving the intermediate sizes during initial rendering
    setTimeout(() => {
      console.log(`[useWindowPersistence] Enabling geometry saving for ${label}`);
      allowSavingRef.current = true;
    }, 2000);

    const debouncedSave = () => {
      // Don't save if window is closing or not yet initialized
      if (!allowSavingRef.current || isClosingRef.current) {
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        // Double-check we're not closing before saving
        // Use sync check to avoid any async operations if closing
        if (isClosingRef.current) {
          return;
        }
        // Fire and forget - don't await to avoid holding references
        windowManager.saveGeometry(label).catch(() => {
          // Ignore errors - window may be closing
        });
      }, 500); // Debounce 500ms
    };

    // Listen for resize and move events
    const unlistenResize = currentWindow.onResized(debouncedSave);
    const unlistenMove = currentWindow.onMoved(debouncedSave);

    // On close: just cancel pending saves, don't try to save
    // The most recent debounced save will have captured the geometry
    const unlistenClose = currentWindow.onCloseRequested(() => {
      isClosingRef.current = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // Don't await anything here - let the window close immediately
    });

    // Cleanup
    return () => {
      isClosingRef.current = true;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      unlistenResize.then((fn) => fn());
      unlistenMove.then((fn) => fn());
      unlistenClose.then((fn) => fn());
    };
  }, [label]);
}
