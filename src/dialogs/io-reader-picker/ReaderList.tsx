// ui/src/dialogs/io-reader-picker/ReaderList.tsx

import { Bookmark, Wifi, Database, FolderOpen } from "lucide-react";
import type { IOProfile } from "../../hooks/useSettings";
import type { Session } from "../../stores/sessionStore";
import { CSV_EXTERNAL_ID, isRealtimeProfile } from "./utils";

type Props = {
  ioProfiles: IOProfile[];
  checkedReaderId: string | null;
  defaultId?: string | null;
  isIngesting: boolean;
  onSelectReader: (readerId: string | null) => void;
  /** Check if a profile has an active session (is "live") */
  isProfileLive?: (profileId: string) => boolean;
  /** Get session for a profile (to check state) */
  getSessionForProfile?: (profileId: string) => Session | undefined;
};

export default function ReaderList({
  ioProfiles,
  checkedReaderId,
  defaultId,
  isIngesting,
  onSelectReader,
  isProfileLive,
  getSessionForProfile,
}: Props) {
  // All profiles are read profiles now (mode field removed), separate by type
  const readProfiles = ioProfiles;
  const realtimeProfiles = readProfiles.filter(isRealtimeProfile);
  const recordedProfiles = readProfiles.filter((p) => !isRealtimeProfile(p));

  const isCsvSelected = checkedReaderId === CSV_EXTERNAL_ID;
  const checkedProfile = checkedReaderId && checkedReaderId !== CSV_EXTERNAL_ID
    ? readProfiles.find((p) => p.id === checkedReaderId) || null
    : null;

  // When a reader is selected, show only that reader in collapsed view
  if (checkedReaderId && !isIngesting) {
    return (
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          IO Reader
        </div>
        <div className="px-3 py-2">
          <button
            onClick={() => onSelectReader(null)}
            className="w-full px-3 py-2 flex items-center gap-3 text-left rounded-lg transition-colors bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/30"
          >
            <div className="w-4 h-4 rounded-full border-2 border-blue-600 dark:border-blue-400 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {isCsvSelected ? "CSV" : (checkedProfile?.name || "Unknown")}
              </span>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {isCsvSelected ? "Import from file" : checkedProfile?.kind}
              </div>
            </div>
            <span className="text-xs text-blue-600 dark:text-blue-400">Change</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        IO Reader
      </div>

      {/* Real-time Sources */}
      {realtimeProfiles.length > 0 && (
        <div className="border-b border-slate-100 dark:border-slate-700/50">
          <div className="px-4 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <Wifi className="w-3 h-3" />
            <span>Real-time</span>
          </div>
          <div className="px-3 pb-2 space-y-1">
            {realtimeProfiles.map((profile) => (
              <ReaderButton
                key={profile.id}
                profile={profile}
                isChecked={checkedReaderId === profile.id}
                isDefault={false}
                isIngesting={isIngesting}
                isLive={isProfileLive?.(profile.id) ?? false}
                sessionState={getSessionForProfile?.(profile.id)?.ioState}
                onSelect={onSelectReader}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recorded Sources */}
      {recordedProfiles.length > 0 && (
        <div className="border-b border-slate-100 dark:border-slate-700/50">
          <div className="px-4 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <Database className="w-3 h-3" />
            <span>Recorded</span>
          </div>
          <div className="px-3 pb-2 space-y-1">
            {recordedProfiles.map((profile) => (
              <ReaderButton
                key={profile.id}
                profile={profile}
                isChecked={checkedReaderId === profile.id}
                isDefault={profile.id === defaultId}
                isIngesting={isIngesting}
                isLive={isProfileLive?.(profile.id) ?? false}
                sessionState={getSessionForProfile?.(profile.id)?.ioState}
                onSelect={onSelectReader}
              />
            ))}
          </div>
        </div>
      )}

      {/* External Sources */}
      <div>
        <div className="px-4 py-1.5 text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
          <FolderOpen className="w-3 h-3" />
          <span>External</span>
        </div>
        <div className="px-3 pb-2 space-y-1">
          <button
            onClick={() => onSelectReader(isCsvSelected ? null : CSV_EXTERNAL_ID)}
            disabled={isIngesting}
            className={`w-full px-3 py-2 flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-50 ${
              isCsvSelected
                ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700"
                : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                isCsvSelected
                  ? "border-blue-600 dark:border-blue-400"
                  : "border-slate-300 dark:border-slate-600"
              }`}
            >
              {isCsvSelected && <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-900 dark:text-white">CSV</span>
              <div className="text-xs text-slate-500 dark:text-slate-400">Import from file</div>
            </div>
          </button>
        </div>
      </div>

      {readProfiles.length === 0 && !isCsvSelected && (
        <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
          No IO readers configured. Add one in Settings.
        </div>
      )}
    </div>
  );
}

// Helper component for reader buttons
function ReaderButton({
  profile,
  isChecked,
  isDefault,
  isIngesting,
  isLive,
  sessionState,
  onSelect,
}: {
  profile: IOProfile;
  isChecked: boolean;
  isDefault: boolean;
  isIngesting: boolean;
  isLive: boolean;
  sessionState?: string;
  onSelect: (readerId: string | null) => void;
}) {
  // Determine badge text and colors based on session state
  const isStopped = sessionState === "stopped";
  const isRunning = isLive && sessionState === "running";

  // Live profile gets green styling when checked, amber when stopped
  const liveAndChecked = isLive && isChecked;

  return (
    <button
      onClick={() => onSelect(isChecked ? null : profile.id)}
      disabled={isIngesting}
      className={`w-full px-3 py-2 flex items-center gap-3 text-left rounded-lg transition-colors disabled:opacity-50 ${
        liveAndChecked
          ? isStopped
            ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700"
            : "bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-700"
          : isChecked
          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700"
          : isLive
          ? isStopped
            ? "bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            : "bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
          : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          liveAndChecked
            ? isStopped
              ? "border-amber-600 dark:border-amber-400"
              : "border-green-600 dark:border-green-400"
            : isChecked
            ? "border-blue-600 dark:border-blue-400"
            : "border-slate-300 dark:border-slate-600"
        }`}
      >
        {isChecked && (
          <div className={`w-2 h-2 rounded-full ${
            liveAndChecked
              ? isStopped
                ? "bg-amber-600 dark:bg-amber-400"
                : "bg-green-600 dark:bg-green-400"
              : "bg-blue-600 dark:bg-blue-400"
          }`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isDefault && <Bookmark className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />}
          <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
            {profile.name}
          </span>
          {isLive && (
            isStopped ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-medium">
                Stopped
              </span>
            ) : isRunning ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 font-medium">
                Live
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 font-medium">
                Active
              </span>
            )
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{profile.kind}</div>
      </div>
    </button>
  );
}
