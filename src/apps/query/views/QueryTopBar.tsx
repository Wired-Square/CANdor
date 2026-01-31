// src/apps/query/views/QueryTopBar.tsx
//
// Top bar for the Query app. Shows amber icon and session controls like other apps.
// Uses same IOSessionControls pattern as Discovery/Decoder.

import { DatabaseZap } from "lucide-react";
import type { IOProfile } from "../../../types/common";
import AppTopBar from "../../../components/AppTopBar";

interface Props {
  // IO profile selection (filtered to postgres only)
  ioProfiles: IOProfile[];
  ioProfile: string | null;
  defaultReadProfileId?: string | null;

  // Dialog trigger
  onOpenIoReaderPicker: () => void;

  // Session state (from useIOSessionManager)
  isStreaming: boolean;
  isStopped?: boolean;
  joinerCount?: number;
  isDetached?: boolean;
  supportsTimeRange?: boolean;

  // Session actions
  onStop?: () => void;
  onResume?: () => void;
  onDetach?: () => void;
  onRejoin?: () => void;
  onOpenBookmarkPicker?: () => void;
}

export default function QueryTopBar({
  ioProfiles,
  ioProfile,
  defaultReadProfileId,
  onOpenIoReaderPicker,
  isStreaming,
  isStopped,
  joinerCount,
  isDetached,
  supportsTimeRange,
  onStop,
  onResume,
  onDetach,
  onRejoin,
  onOpenBookmarkPicker,
}: Props) {
  return (
    <AppTopBar
      icon={DatabaseZap}
      iconColour="text-[color:var(--text-amber)]"
      ioSession={{
        ioProfile,
        ioProfiles,
        defaultReadProfileId,
        onOpenIoReaderPicker,
        isStreaming,
        isStopped,
        joinerCount,
        isDetached,
        supportsTimeRange,
        onStop,
        onResume,
        onDetach,
        onRejoin,
        onOpenBookmarkPicker,
      }}
    />
  );
}
