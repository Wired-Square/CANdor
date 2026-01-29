// ui/src/apps/discovery/dialogs/AnalysisProgressDialog.tsx

import { Loader2 } from "lucide-react";
import Dialog from "../../../components/Dialog";
import { bgSecondary, captionMuted } from "../../../styles";

export interface AnalysisProgressDialogProps {
  isOpen: boolean;
  frameCount: number;
  toolName: string;
}

export default function AnalysisProgressDialog({
  isOpen,
  frameCount,
  toolName,
}: AnalysisProgressDialogProps) {
  return (
    <Dialog isOpen={isOpen} maxWidth="max-w-sm">
      <div className="p-6 text-center">
        {/* Animated loader */}
        <div className="mb-4">
          <Loader2 className="w-12 h-12 mx-auto text-purple-600 dark:text-purple-400 animate-spin" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Analyzing Frames
        </h2>

        {/* Frame count */}
        <div className="text-3xl font-mono font-bold text-purple-600 dark:text-purple-400 mb-1">
          {frameCount.toLocaleString()}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          frames being processed
        </p>

        {/* Tool info */}
        <div className={`${captionMuted} px-4 py-2 ${bgSecondary} rounded`}>
          Running <span className="font-medium text-slate-600 dark:text-slate-300">{toolName}</span> analysis...
        </div>
      </div>
    </Dialog>
  );
}
