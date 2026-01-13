// ui/src/dialogs/NoLimitProgressDialog.tsx

import { memo } from "react";
import { Pause, Play, Square, Loader2 } from "lucide-react";
import Dialog from "../components/Dialog";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { playButtonBase, pauseButtonBase, stopButtonBase } from "../styles";

export interface NoLimitProgressDialogProps {
  isOpen: boolean;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

// Separate component for frame count display to isolate re-renders
const FrameCountDisplay = memo(function FrameCountDisplay() {
  const frameCount = useDiscoveryStore((state) => state.noLimitMode.frameCount);
  return (
    <div className="text-3xl font-mono font-bold text-purple-600 dark:text-purple-400 mb-1">
      {frameCount.toLocaleString()}
    </div>
  );
});

// Memoized button components to prevent re-renders from parent
const PauseButton = memo(function PauseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={pauseButtonBase}>
      <Pause className="w-4 h-4" />
      Pause
    </button>
  );
});

const ResumeButton = memo(function ResumeButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={playButtonBase}>
      <Play className="w-4 h-4" />
      Resume
    </button>
  );
});

const StopButton = memo(function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className={stopButtonBase}>
      <Square className="w-4 h-4" />
      Stop
    </button>
  );
});

export default function NoLimitProgressDialog({
  isOpen,
  isPaused,
  onPause,
  onResume,
  onStop,
}: NoLimitProgressDialogProps) {
  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-sm">
      <div className="p-6 text-center">
        {/* Animated loader or paused indicator */}
        <div className="mb-4">
          {isPaused ? (
            <div className="w-12 h-12 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <Pause className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
          ) : (
            <Loader2 className="w-12 h-12 mx-auto text-purple-600 dark:text-purple-400 animate-spin" />
          )}
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {isPaused ? "Ingestion Paused" : "Ingesting Frames"}
        </h2>

        {/* Frame count - isolated component */}
        <FrameCountDisplay />
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          frames received
        </p>

        {/* Controls - memoized buttons */}
        <div className="flex justify-center gap-3">
          {isPaused ? (
            <ResumeButton onClick={onResume} />
          ) : (
            <PauseButton onClick={onPause} />
          )}
          <StopButton onClick={onStop} />
        </div>

        {/* Help text */}
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Frames will be displayed after stopping or pausing.
        </p>
      </div>
    </Dialog>
  );
}
