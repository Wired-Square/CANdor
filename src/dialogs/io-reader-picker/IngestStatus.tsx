// ui/src/dialogs/io-reader-picker/IngestStatus.tsx

import { Loader2, Square } from "lucide-react";
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
  isIngesting: boolean;
  ingestFrameCount: number;
  ingestError: string | null;
  onStopIngest: () => void;
};

export default function IngestStatus({
  isIngesting,
  ingestFrameCount,
  ingestError,
  onStopIngest,
}: Props) {
  return (
    <>
      {/* Ingest Status (when active) */}
      {isIngesting && (
        <div className={`px-4 py-2 ${bgSuccess} border-b ${borderSuccess} flex items-center justify-between`}>
          <div className={`flex items-center ${gapSmall}`}>
            <Loader2 className={`w-4 h-4 animate-spin ${textSuccess}`} />
            <span className={`text-sm ${textSuccess}`}>
              Ingesting: {ingestFrameCount.toLocaleString()} frames
            </span>
          </div>
          <button
            onClick={onStopIngest}
            className={`px-2 py-1 flex items-center ${gapTight} text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors`}
          >
            <Square className="w-3 h-3" />
            <span>Stop</span>
          </button>
        </div>
      )}

      {/* Ingest Error */}
      {ingestError && (
        <div className={`px-4 py-2 ${bgDanger} border-b ${borderDanger}`}>
          <div className={`text-xs ${textDanger}`}>{ingestError}</div>
        </div>
      )}
    </>
  );
}
