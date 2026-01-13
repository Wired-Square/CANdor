// ui/src/apps/transmit/views/TransmitTopBar.tsx
//
// Top toolbar for the Transmit app with IO picker button and session dropdown.
// Sessions are managed through sessionStore for multi-session support.

import { useCallback, useMemo, useState } from "react";
import {
  Database,
  Square,
  Unplug,
  ChevronDown,
  Link2,
  X,
  PlugZap,
} from "lucide-react";
import { useTransmitStore } from "../../../stores/transmitStore";
import {
  useSessionStore,
  useTransmitDropdownSessions,
  type Session,
} from "../../../stores/sessionStore";
import {
  bgDarkToolbar,
  borderDarkView,
  textDarkInput,
  bgDarkInput,
  textDarkMuted,
} from "../../../styles/colourTokens";
import {
  buttonBase,
  stopButtonCompact,
  warningButtonBase,
} from "../../../styles/buttonStyles";

interface Props {
  onOpenIoPicker: () => void;
}

export default function TransmitTopBar({ onOpenIoPicker }: Props) {
  // Get sessions from sessionStore
  const dropdownSessions = useTransmitDropdownSessions();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const leaveSession = useSessionStore((s) => s.leaveSession);
  const stopSession = useSessionStore((s) => s.stopSession);
  const removeSession = useSessionStore((s) => s.removeSession);

  // Get error from transmit store
  const error = useTransmitStore((s) => s.error);
  const isLoading = useTransmitStore((s) => s.isLoading);

  // Dropdown open state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Get active session
  const activeSession = useMemo(
    () => dropdownSessions.find((s) => s.id === activeSessionId),
    [dropdownSessions, activeSessionId]
  );

  // Handle session selection from dropdown
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      setDropdownOpen(false);
    },
    [setActiveSession]
  );

  // Handle stop - stops streaming on the active session
  const handleStop = useCallback(async () => {
    if (activeSessionId) {
      await stopSession(activeSessionId);
    }
  }, [activeSessionId, stopSession]);

  // Handle disconnect - leaves/disconnects from the session
  const handleDisconnect = useCallback(async () => {
    if (activeSessionId) {
      await leaveSession(activeSessionId, "transmit");
      // Select another session if available
      const remaining = dropdownSessions.filter((s) => s.id !== activeSessionId);
      if (remaining.length > 0) {
        setActiveSession(remaining[0].id);
      } else {
        setActiveSession(null);
      }
    }
  }, [activeSessionId, leaveSession, dropdownSessions, setActiveSession]);

  // Handle remove - removes a disconnected session from the list
  const handleRemove = useCallback(
    async (sessionId: string) => {
      await removeSession(sessionId);
      if (activeSessionId === sessionId) {
        const remaining = dropdownSessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          setActiveSession(remaining[0].id);
        } else {
          setActiveSession(null);
        }
      }
    },
    [activeSessionId, removeSession, dropdownSessions, setActiveSession]
  );

  // Get display name for a session
  const getSessionDisplayName = (session: Session) => {
    let name = session.profileName || session.id;
    if (session.lifecycleState === "disconnected") {
      name += " (disconnected)";
    } else if (session.ioState === "running") {
      name += " (streaming)";
    } else if (!session.isOwner) {
      name += " (joined)";
    }
    return name;
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${bgDarkToolbar} border-b ${borderDarkView}`}
    >
      {/* IO Picker Button */}
      <button
        onClick={onOpenIoPicker}
        className={buttonBase}
        title="Open data source picker"
      >
        <Database size={14} />
        <span className="text-sm">Data Source</span>
      </button>

      {/* Session Dropdown */}
      {dropdownSessions.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-2 ${bgDarkInput} ${textDarkInput} text-sm rounded px-3 py-1.5 border ${borderDarkView} hover:border-gray-500 focus:outline-none focus:border-blue-500 min-w-[200px]`}
          >
            {activeSession ? (
              <>
                {activeSession.lifecycleState === "connected" ? (
                  <PlugZap size={14} className="text-green-400" />
                ) : (
                  <Unplug size={14} className="text-gray-500" />
                )}
                <span className="flex-1 text-left truncate">
                  {activeSession.profileName || activeSession.id}
                </span>
                {!activeSession.isOwner &&
                  activeSession.lifecycleState === "connected" && (
                    <Link2 size={12} className="text-blue-400" />
                  )}
              </>
            ) : (
              <span className="flex-1 text-left text-gray-500">
                Select session...
              </span>
            )}
            <ChevronDown size={14} />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <>
              {/* Backdrop to close dropdown */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div
                className={`absolute top-full left-0 mt-1 w-full min-w-[250px] ${bgDarkInput} border ${borderDarkView} rounded shadow-lg z-50 max-h-60 overflow-y-auto`}
              >
                {dropdownSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-700 ${
                      session.id === activeSessionId ? "bg-gray-700" : ""
                    }`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    {session.lifecycleState === "connected" ? (
                      <PlugZap size={14} className="text-green-400 shrink-0" />
                    ) : (
                      <Unplug size={14} className="text-gray-500 shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">
                      {getSessionDisplayName(session)}
                    </span>
                    {!session.isOwner &&
                      session.lifecycleState === "connected" && (
                        <Link2 size={12} className="text-blue-400 shrink-0" />
                      )}
                    {/* Remove button for disconnected sessions */}
                    {session.lifecycleState === "disconnected" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(session.id);
                        }}
                        className="p-1 hover:bg-red-600 rounded"
                        title="Remove session"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Stop button - only shown when active session is streaming */}
      {activeSession?.ioState === "running" && (
        <button
          onClick={handleStop}
          className={stopButtonCompact}
          title="Stop streaming"
        >
          <Square size={14} />
        </button>
      )}

      {/* Disconnect button - only shown when active session is connected */}
      {activeSession?.lifecycleState === "connected" && (
        <button
          onClick={handleDisconnect}
          className={warningButtonBase}
          title={
            activeSession.listenerCount > 1
              ? "Detach from session (other apps still connected)"
              : "Disconnect session"
          }
        >
          <Unplug size={14} />
        </button>
      )}

      {/* Capability badges for active session */}
      {activeSession?.capabilities && (
        <div className="flex items-center gap-2 ml-2">
          {activeSession.capabilities.can_transmit && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-600/30 text-blue-400">
              CAN
            </span>
          )}
          {activeSession.capabilities.can_transmit_serial && (
            <span className="text-xs px-2 py-0.5 rounded bg-purple-600/30 text-purple-400">
              Serial
            </span>
          )}
          {activeSession.capabilities.supports_canfd && (
            <span className="text-xs px-2 py-0.5 rounded bg-green-600/30 text-green-400">
              FD
            </span>
          )}
          {activeSession.capabilities.available_buses.length > 1 && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-600/30 text-amber-400">
              Multi-Bus
            </span>
          )}
        </div>
      )}

      {/* Joiner count indicator */}
      {activeSession && activeSession.listenerCount > 1 && (
        <div className="flex items-center gap-1 text-blue-400">
          <Link2 size={14} />
          <span className="text-xs">
            {activeSession.listenerCount} apps connected
          </span>
        </div>
      )}

      <div className="flex-1" />

      {/* Loading indicator */}
      {isLoading && (
        <span className={`text-xs ${textDarkMuted}`}>Loading...</span>
      )}

      {/* Connection error */}
      {error && (
        <span className="text-xs text-red-400 max-w-[300px] truncate">
          {error}
        </span>
      )}
    </div>
  );
}
