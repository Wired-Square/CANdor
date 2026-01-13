// ui/src/apps/transmit/Transmit.tsx
//
// Main Transmit app component with tabbed interface for CAN/Serial transmission.
// Uses sessionStore for multi-session support with IO picker dialog.

import { useEffect, useCallback, useState } from "react";
import { Send, AlertCircle, PlugZap, Unplug } from "lucide-react";
import { useTransmitStore, type TransmitTab } from "../../stores/transmitStore";
import {
  useSessionStore,
  useTransmitDropdownSessions,
} from "../../stores/sessionStore";
import { useSettings } from "../../hooks/useSettings";
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
import IoReaderPickerDialog, {
  type IngestOptions,
} from "../../dialogs/IoReaderPickerDialog";

export default function Transmit() {
  // Settings for IO profiles
  const { settings } = useSettings();
  const ioProfiles = settings?.io_profiles ?? [];

  // Filter to only transmit-capable profiles
  const transmitProfiles = ioProfiles.filter((p) => {
    // slcan in normal mode can transmit
    if (p.kind === "slcan" && !p.connection?.silent_mode) return true;
    // gvret_tcp and gvret_usb can transmit
    if (p.kind === "gvret_tcp" || p.kind === "gvret_usb") return true;
    // serial ports can transmit serial data
    if (p.kind === "serial") return true;
    return false;
  });

  // Store selectors
  const profiles = useTransmitStore((s) => s.profiles);
  const activeTab = useTransmitStore((s) => s.activeTab);
  const queue = useTransmitStore((s) => s.queue);
  const history = useTransmitStore((s) => s.history);
  const error = useTransmitStore((s) => s.error);
  const isLoading = useTransmitStore((s) => s.isLoading);

  // Store actions
  const loadProfiles = useTransmitStore((s) => s.loadProfiles);
  const setActiveTab = useTransmitStore((s) => s.setActiveTab);
  const cleanup = useTransmitStore((s) => s.cleanup);
  const clearError = useTransmitStore((s) => s.clearError);

  // Session store
  const dropdownSessions = useTransmitDropdownSessions();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const openSession = useSessionStore((s) => s.openSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const startSession = useSessionStore((s) => s.startSession);

  // Dialog state
  const [showIoPickerDialog, setShowIoPickerDialog] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );

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

  // Get active session for connection status display
  const activeSession = dropdownSessions.find((s) => s.id === activeSessionId);
  const isConnected = activeSession?.lifecycleState === "connected";

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

  // Handle profile selection in IO picker
  const handleProfileSelect = useCallback((id: string | null) => {
    setSelectedProfileId(id);
  }, []);

  // Handle starting a session from IO picker (Watch mode - creates session and starts)
  const handleStartSession = useCallback(
    async (
      profileId: string,
      closeDialog: boolean,
      _options: IngestOptions
    ) => {
      try {
        // Find profile name
        const profile = transmitProfiles.find((p) => p.id === profileId);
        const profileName = profile?.name ?? profileId;

        // Open session via sessionStore (will join existing if profile is in use)
        // Session ID = Profile ID (simplified model - all apps share sessions)
        const session = await openSession(profileId, profileName, "transmit", {
          joinExisting: true, // Join if profile is in use by Discovery/Decoder
        });

        // Start the session if not already running
        if (session.ioState !== "running") {
          await startSession(session.id);
        }

        // Set as active session
        setActiveSession(session.id);

        if (closeDialog) {
          setShowIoPickerDialog(false);
        }
      } catch (e) {
        console.error("Failed to create session:", e);
        // Error will be shown via transmit store error state
      }
    },
    [openSession, startSession, setActiveSession, transmitProfiles]
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

  return (
    <div className={`flex flex-col h-full ${bgDarkView}`}>
      {/* Top Bar */}
      <TransmitTopBar onOpenIoPicker={handleOpenIoPicker} />

      {/* Error Banner */}
      {error && (
        <div
          className={`flex items-center gap-2 px-4 py-2 bg-red-900/50 border-b ${borderDarkView}`}
        >
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-red-300 text-sm flex-1">{error}</span>
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
            {dropdownSessions.length > 0 && (
              <div className="flex items-center gap-2 py-2">
                {isConnected ? (
                  <>
                    <PlugZap size={14} className="text-green-400" />
                    <span className="text-green-400 text-xs">Connected</span>
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
        selectedId={selectedProfileId}
        defaultId={null}
        onSelect={handleProfileSelect}
        onStartIngest={handleStartSession}
        hideBuffers={true}
      />
    </div>
  );
}
