// ui/src/dialogs/io-source-picker/LoadStatus.tsx

import { Loader2, Square } from "lucide-react";
import { iconMd, iconXs } from "../../styles/spacing";
import {
  bgSuccess,
  borderSuccess,
  textSuccess,
  bgDanger,
  borderDanger,
  textDanger,
  gapTight,
  gapSmall,
} from "../../styles";

type Props = {
  isLoading: boolean;
  loadFrameCount: number;
  loadError: string | null;
  onStopLoad: () => void;
};

export default function LoadStatus({
  isLoading,
  loadFrameCount,
  loadError,
  onStopLoad,
}: Props) {
  return (
    <>
      {/* Load Status (when active) */}
      {isLoading && (
        <div className={`px-4 py-2 ${bgSuccess} border-b ${borderSuccess} flex items-center justify-between`}>
          <div className={`flex items-center ${gapSmall}`}>
            <Loader2 className={`${iconMd} animate-spin ${textSuccess}`} />
            <span className={`text-sm ${textSuccess}`}>
              Loading: {loadFrameCount.toLocaleString()} frames
            </span>
          </div>
          <button
            onClick={onStopLoad}
            className={`px-2 py-1 flex items-center ${gapTight} text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors`}
          >
            <Square className={iconXs} />
            <span>Stop</span>
          </button>
        </div>
      )}

      {/* Load Error */}
      {loadError && (
        <div className={`px-4 py-2 ${bgDanger} border-b ${borderDanger}`}>
          <div className={`text-xs ${textDanger}`}>{loadError}</div>
        </div>
      )}
    </>
  );
}
