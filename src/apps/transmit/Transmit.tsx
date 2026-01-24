// ui/src/apps/transmit/Transmit.tsx
//
// Main Transmit app component with tabbed interface for CAN/Serial transmission.
// Uses useIOSessionManager for session management.

import { useEffect, useCallback, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Send, AlertCircle, PlugZap, Unplug } from "lucide-react";
import { useTransmitStore, type TransmitTab } from "../../stores/transmitStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useIOSessionManager, type IngestOptions } from "../../hooks/useIOSessionManager";
import { useSettings, type IOProfile } from "../../hooks/useSettings";
import type { TransmitHistoryEvent, SerialTransmitHistoryEvent, RepeatStoppedEvent } from "../../api/transmit";
import {
  bgDarkView,
  bgDarkToolbar,
  borderDarkView,
  textDarkMuted,
} from "../../styles/colourTokens";
import { dataViewTabClass, tabCountColorClass } from "../../styles/buttonStyles";
import TransmitTopBar from "./views/TransmitTopBar";
import CanTransmitView from "./views/CanTransmitView";
import SerialTransmitView from "./views/SerialTransmitView";
import TransmitQueueView from "./views/TransmitQueueView";
import TransmitHistoryView from "./views/TransmitHistoryView";
import IoReaderPickerDialog from "../../dialogs/IoReaderPickerDialog";

export default function Transmit() {
  // Settings for IO profiles
  const { settings } = useSettings();
  const ioProfiles = settings?.io_profiles ?? [];

  // Helper to check if a profile can transmit and why not
  const getTransmitStatus = useCallback((p: IOProfile): { canTransmit: boolean; reason?: string } => {
    // slcan in normal mode can transmit
    if (p.kind === "slcan") {
      if (p.connection?.silent_mode) {
        return { canTransmit: false, reason: "Silent mode enabled" };
      }
      return { canTransmit: true };
    }
    // gvret_tcp and gvret_usb can transmit
    if (p.kind === "gvret_tcp" || p.kind === "gvret_usb") {
      return { canTransmit: true };
    }
    // gs_usb can transmit if not in listen-only mode
    if (p.kind === "gs_usb") {
      if (p.connection?.listen_only !== false) {
        return { canTransmit: false, reason: "Listen-only mode" };
      }
      return { canTransmit: true };
    }
    // socketcan can transmit (if not in listen-only mode, but that's configured at system level)
    if (p.kind === "socketcan") {
      return { canTransmit: true };
    }
    // serial ports can transmit serial data
    if (p.kind === "serial") {
      return { canTransmit: true };
    }
    return { canTransmit: false, reason: "Not a transmit interface" };
  }, []);

  // Get all CAN/serial profiles that could potentially be used for transmit
  // Include non-transmittable ones so we can show them as disabled
  const transmitProfiles = useMemo(
    () =>
      ioProfiles.filter((p) => {
        // Include all CAN-capable real-time interfaces
        if (p.kind === "slcan") return true;
        if (p.kind === "gvret_tcp" || p.kind === "gvret_usb") return true;
        if (p.kind === "gs_usb") return true;
        if (p.kind === "socketcan") return true;
        // Include serial ports
        if (p.kind === "serial") return true;
        return false;
      }),
    [ioProfiles]
  );

  // Map of profile ID to transmit status (for passing to dialog)
  const transmitStatusMap = useMemo(
    () => new Map(transmitProfiles.map((p) => [p.id, getTransmitStatus(p)])),
    [transmitProfiles, getTransmitStatus]
  );

  // Store selectors
  const profiles = useTransmitStore((s) => s.profiles);
  const activeTab = useTransmitStore((s) => s.activeTab);
  const queue = useTransmitStore((s) => s.queue);
  const history = useTransmitStore((s) => s.history);
  const transmitError = useTransmitStore((s) => s.error);
  const isLoading = useTransmitStore((s) => s.isLoading);

  // Store actions
  const loadProfiles = useTransmitStore((s) => s.loadProfiles);
  const setActiveTab = useTransmitStore((s) => s.setActiveTab);
  const cleanup = useTransmitStore((s) => s.cleanup);
  const clearError = useTransmitStore((s) => s.clearError);
  const stopAllRepeats = useTransmitStore((s) => s.stopAllRepeats);
  const stopAllGroupRepeats = useTransmitStore((s) => s.stopAllGroupRepeats);

  // Dialog state
  const [showIoPickerDialog, setShowIoPickerDialog] = useState(false);

  // Error handler for session errors
  const handleError = useCallback((error: string) => {
    console.error("[Transmit] Session error:", error);
  }, []);

  // Use centralized IO session manager
  const manager = useIOSessionManager({
    appName: "transmit",
    ioProfiles: transmitProfiles,
    onError: handleError,
  });

  // Destructure manager state
  const {
    ioProfile,
    setIoProfile,
    ioProfileName,
    multiBusMode,
    multiBusProfiles,
    setMultiBusMode,
    setMultiBusProfiles,
    effectiveSessionId,
    session,
    isStreaming,
    isPaused,
    isStopped,
    sessionReady,
    capabilities,
    joinerCount,
    isDetached,
    handleDetach: managerDetach,
    handleRejoin: managerRejoin,
    startMultiBusSession,
  } = manager;

  // Session controls
  const {
    start,
    stop,
    leave,
    rejoin,
    reinitialize,
  } = session;

  // Derive connected state
  const isConnected = sessionReady && (isStreaming || isPaused || isStopped);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Listen for transmit history events from repeat transmissions
  const addHistoryItem = useTransmitStore((s) => s.addHistoryItem);
  const markRepeatStopped = useTransmitStore((s) => s.markRepeatStopped);
  useEffect(() => {
    // CAN transmit history events
    const unlistenCan = listen<TransmitHistoryEvent>("transmit-history", (event) => {
      const data = event.payload;
      // Map session_id to profile name (use queue_id as fallback identifier)
      const profileName = ioProfileName ?? data.session_id;
      addHistoryItem({
        timestamp_us: data.timestamp_us,
        profileId: data.session_id,
        profileName,
        type: "can",
        frame: data.frame,
        success: data.success,
        error: data.error,
      });
    });

    // Serial transmit history events
    const unlistenSerial = listen<SerialTransmitHistoryEvent>("serial-transmit-history", (event) => {
      const data = event.payload;
      const profileName = ioProfileName ?? data.session_id;
      addHistoryItem({
        timestamp_us: data.timestamp_us,
        profileId: data.session_id,
        profileName,
        type: "serial",
        bytes: data.bytes,
        success: data.success,
        error: data.error,
      });
    });

    // Repeat stopped events (due to permanent error)
    const unlistenStopped = listen<RepeatStoppedEvent>("repeat-stopped", (event) => {
      const data = event.payload;
      console.warn(`[Transmit] Repeat stopped for ${data.queue_id}: ${data.reason}`);
      markRepeatStopped(data.queue_id);
    });

    return () => {
      unlistenCan.then((fn) => fn());
      unlistenSerial.then((fn) => fn());
      unlistenStopped.then((fn) => fn());
    };
  }, [addHistoryItem, markRepeatStopped, ioProfileName]);

  // Set active session for child components (CanTransmitView, etc.)
  // This allows useActiveSession() to return the correct session
  useEffect(() => {
    const store = useSessionStore.getState();
    if (isConnected && effectiveSessionId) {
      store.setActiveSession(effectiveSessionId);
    } else if (!isConnected && store.activeSessionId === effectiveSessionId) {
      // Clear only if we were the active session
      store.setActiveSession(null);
    }
    // Clear active session on unmount if we were the active session
    return () => {
      const currentStore = useSessionStore.getState();
      if (currentStore.activeSessionId === effectiveSessionId) {
        currentStore.setActiveSession(null);
      }
    };
  }, [isConnected, effectiveSessionId]);

  // Count active repeats in queue
  const activeRepeats = queue.filter((q) => q.isRepeating).length;

  // Tab click handler
  const handleTabClick = useCallback(
    (tab: TransmitTab) => {
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  // Handle opening IO picker
  const handleOpenIoPicker = useCallback(() => {
    setShowIoPickerDialog(true);
  }, []);

  // Handle starting a session from IO picker (Watch mode)
  const handleStartSession = useCallback(
    async (
      profileId: string,
      closeDialog: boolean,
      _options: IngestOptions
    ) => {
      try {
        // Exit multi-bus mode if switching to single profile
        if (multiBusMode) {
          setMultiBusMode(false);
          setMultiBusProfiles([]);
        }

        // Set the profile - this triggers useIOSession to create/join the session
        setIoProfile(profileId);

        // Reinitialize to ensure session is started
        await reinitialize(profileId);

        // Start the session if not already running
        if (!isStreaming) {
          await start();
        }

        if (closeDialog) {
          setShowIoPickerDialog(false);
        }
      } catch (e) {
        console.error("Failed to create session:", e);
      }
    },
    [multiBusMode, setMultiBusMode, setMultiBusProfiles, setIoProfile, reinitialize, isStreaming, start]
  );

  // Handle stop - also stop all queue repeats and leave session
  // For single-handle devices (serial, slcan), we need to leave the session
  // to release the device so it can be reconnected later.
  const handleStop = useCallback(async () => {
    // Stop all active repeats before stopping the session
    await stopAllRepeats();
    await stopAllGroupRepeats();
    await stop();
    // Leave the session to release single-handle devices (serial, slcan)
    // This triggers session destruction and profile tracking cleanup
    await leave();
  }, [stop, leave, stopAllRepeats, stopAllGroupRepeats]);

  // Handle resume
  const handleResume = useCallback(async () => {
    await start();
  }, [start]);

  // Handle detach (leave session without stopping it)
  const handleDetach = useCallback(async () => {
    await managerDetach();
  }, [managerDetach]);

  // Handle rejoin after detaching
  const handleRejoin = useCallback(async () => {
    await managerRejoin();
  }, [managerRejoin]);

  // Handle joining an existing session from the IO picker dialog
  const handleJoinSession = useCallback(
    async (sessionId: string, sourceProfileIds?: string[]) => {
      try {
        // Check if this is a multi-source session
        if (sourceProfileIds && sourceProfileIds.length > 0) {
          // Multi-source session - join it
          setMultiBusMode(false); // We're joining, not creating
          setMultiBusProfiles(sourceProfileIds);
          setIoProfile(sessionId);
        } else {
          // Single profile session
          if (multiBusMode) {
            setMultiBusMode(false);
            setMultiBusProfiles([]);
          }
          setIoProfile(sessionId);
        }

        // Rejoin the session
        await rejoin(sessionId);

        // Close the dialog
        setShowIoPickerDialog(false);
      } catch (e) {
        console.error("Failed to join session:", e);
      }
    },
    [multiBusMode, setMultiBusMode, setMultiBusProfiles, setIoProfile, rejoin]
  );

  // Handle starting a multi-source session from IO picker (multi-bus mode)
  const handleStartMultiIngest = useCallback(
    async (
      profileIds: string[],
      closeDialog: boolean,
      options: IngestOptions
    ) => {
      try {
        // Use manager's centralized multi-bus session handler
        await startMultiBusSession(profileIds, options);

        if (closeDialog) {
          setShowIoPickerDialog(false);
        }
      } catch (e) {
        console.error("Failed to create multi-source session:", e);
      }
    },
    [startMultiBusSession]
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "can":
        return <CanTransmitView />;
      case "serial":
        return <SerialTransmitView />;
      case "queue":
        return <TransmitQueueView />;
      case "history":
        return <TransmitHistoryView />;
      default:
        return null;
    }
  };

  // Current profile ID for display
  const currentProfileId = ioProfile;

  return (
    <div className={`flex flex-col h-full ${bgDarkView}`}>
      {/* Top Bar */}
      <TransmitTopBar
        ioProfiles={transmitProfiles}
        ioProfile={currentProfileId}
        defaultReadProfileId={settings?.default_read_profile}
        multiBusMode={multiBusMode}
        multiBusProfiles={multiBusProfiles}
        isStreaming={isStreaming}
        isStopped={isStopped}
        isDetached={isDetached}
        joinerCount={joinerCount}
        capabilities={capabilities}
        onOpenIoPicker={handleOpenIoPicker}
        onStop={handleStop}
        onResume={handleResume}
        onDetach={handleDetach}
        onRejoin={handleRejoin}
        isLoading={isLoading}
        error={transmitError}
      />

      {/* Error Banner */}
      {transmitError && (
        <div
          className={`flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b ${borderDarkView}`}
        >
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-red-300 text-sm flex-1">{transmitError}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading / No Profiles State */}
      {isLoading && profiles.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className={`${textDarkMuted} text-sm`}>Loading profiles...</div>
        </div>
      )}

      {!isLoading && transmitProfiles.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <Send size={48} className={textDarkMuted} />
          <div className={`${textDarkMuted} text-center`}>
            <p className="text-lg font-medium">No Transmit-Capable Profiles</p>
            <p className="text-sm mt-2">
              Add an IO profile (slcan, GVRET TCP, SocketCAN, or Serial) in
              Settings to enable transmission.
            </p>
            <p className="text-sm mt-1 text-gray-500">
              Note: slcan profiles in silent mode (M1) cannot transmit.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      {transmitProfiles.length > 0 && (
        <>
          {/* Tab Bar */}
          <div
            className={`flex items-center gap-1 px-4 ${bgDarkToolbar} border-b ${borderDarkView}`}
          >
            <button
              onClick={() => handleTabClick("can")}
              className={dataViewTabClass(activeTab === "can")}
            >
              CAN
            </button>
            <button
              onClick={() => handleTabClick("serial")}
              className={dataViewTabClass(activeTab === "serial")}
            >
              Serial
            </button>
            <button
              onClick={() => handleTabClick("queue")}
              className={dataViewTabClass(activeTab === "queue", activeRepeats > 0)}
            >
              Queue
              {queue.length > 0 && (
                <span
                  className={`ml-1.5 ${
                    activeRepeats > 0
                      ? tabCountColorClass("green")
                      : tabCountColorClass("gray")
                  }`}
                >
                  ({queue.length})
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabClick("history")}
              className={dataViewTabClass(activeTab === "history")}
            >
              History
              {history.length > 0 && (
                <span className={`ml-1.5 ${tabCountColorClass("gray")}`}>
                  ({history.length})
                </span>
              )}
            </button>

            {/* Connection status indicator */}
            <div className="flex-1" />
            {currentProfileId && (
              <div className="flex items-center gap-2 py-2">
                {isConnected ? (
                  <>
                    <PlugZap size={14} className="text-green-400" />
                    <span className="text-green-400 text-xs">Connected</span>
                  </>
                ) : isDetached ? (
                  <>
                    <Unplug size={14} className="text-amber-400" />
                    <span className="text-amber-400 text-xs">Detached</span>
                  </>
                ) : (
                  <>
                    <Unplug size={14} className={textDarkMuted} />
                    <span className={`${textDarkMuted} text-xs`}>
                      Disconnected
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">{renderTabContent()}</div>
        </>
      )}

      {/* IO Picker Dialog */}
      <IoReaderPickerDialog
        isOpen={showIoPickerDialog}
        onClose={() => setShowIoPickerDialog(false)}
        ioProfiles={transmitProfiles}
        selectedId={currentProfileId ?? null}
        defaultId={null}
        onSelect={() => {}} // Selection happens through onStartIngest/onJoinSession
        onStartIngest={handleStartSession}
        onStartMultiIngest={handleStartMultiIngest}
        onJoinSession={handleJoinSession}
        hideBuffers={true}
        allowMultiSelect={true}
        disabledProfiles={transmitStatusMap}
      />
    </div>
  );
}
