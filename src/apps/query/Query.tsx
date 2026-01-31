// src/apps/query/Query.tsx
//
// Query app for querying PostgreSQL data sources to answer analytical questions
// about CAN bus history. Uses the session system so other apps can share the
// session to visualise discovered timeslices.

import { useCallback, useMemo, useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { useIOSessionManager } from "../../hooks/useIOSessionManager";
import { useQueryStore } from "./stores/queryStore";
import { useDialogManager } from "../../hooks/useDialogManager";
import type { FrameMessage } from "../../stores/discoveryStore";
import type { PlaybackPosition } from "../../api/io";
import AppLayout from "../../components/AppLayout";
import AppTabView, { type TabDefinition, type ProtocolBadge } from "../../components/AppTabView";
import QueryTopBar from "./views/QueryTopBar";
import QueryBuilderPanel from "./views/QueryBuilderPanel";
import ResultsPanel from "./views/ResultsPanel";
import IoReaderPickerDialog from "../../dialogs/IoReaderPickerDialog";
import ErrorDialog from "../../dialogs/ErrorDialog";

export default function Query() {
  const { settings } = useSettings();

  // Tab state
  const [activeTab, setActiveTab] = useState<string>("query");

  // Query store selectors
  const ioProfile = useQueryStore((s) => s.ioProfile);
  const setIoProfile = useQueryStore((s) => s.setIoProfile);
  const error = useQueryStore((s) => s.error);
  const setError = useQueryStore((s) => s.setError);
  const resultCount = useQueryStore((s) => s.resultCount);

  // Dialog management
  const dialogs = useDialogManager([
    "ioReaderPicker",
    "error",
  ] as const);

  // Filter profiles to postgres only
  const postgresProfiles = useMemo(
    () => (settings?.io_profiles ?? []).filter((p) => p.kind === "postgres"),
    [settings?.io_profiles]
  );

  // Frame callback - frames arrive when user clicks a result row to ingest
  const handleFrames = useCallback((_frames: FrameMessage[]) => {
    // Frames are handled by the session system and shared with other apps
  }, []);

  // Error callback
  const handleError = useCallback(
    (errorMsg: string) => {
      setError(errorMsg);
      dialogs.error.open();
    },
    [setError, dialogs.error]
  );

  // Time update callback
  const handleTimeUpdate = useCallback((_position: PlaybackPosition) => {
    // Time updates are handled by session system
  }, []);

  // Session manager - used when clicking result rows to ingest data
  const manager = useIOSessionManager({
    appName: "query",
    ioProfiles: postgresProfiles,
    store: { ioProfile, setIoProfile },
    onFrames: handleFrames,
    onError: handleError,
    onTimeUpdate: handleTimeUpdate,
  });

  // Destructure session state and actions from manager
  const {
    connectOnly,
    watchSingleSource,
    stopWatch,
    skipReader,
    isStreaming,
    isStopped,
    joinerCount,
    isDetached,
    handleDetach,
    handleRejoin,
    capabilities,
    session,
  } = manager;

  // Handle Connect from IoReaderPickerDialog (connect mode)
  // Creates session without streaming - queries run inside session but don't stream to other apps
  const handleConnect = useCallback(async (profileId: string) => {
    await connectOnly(profileId);
  }, [connectOnly]);

  // Profile change handler (for onSelect callback)
  const handleIoProfileChange = useCallback(
    (profileId: string | null) => {
      setIoProfile(profileId);
    },
    [setIoProfile]
  );

  // Ingest around event handler - called when user clicks a result row
  const handleIngestAroundEvent = useCallback(
    async (timestampUs: number) => {
      const { contextWindow } = useQueryStore.getState();
      const eventTimeMs = timestampUs / 1000;

      const startTime = new Date(eventTimeMs - contextWindow.beforeMs).toISOString();
      const endTime = new Date(eventTimeMs + contextWindow.afterMs).toISOString();

      if (ioProfile) {
        await watchSingleSource(ioProfile, { startTime, endTime });
      }
    },
    [ioProfile, watchSingleSource]
  );

  // Skip handler for IO picker
  const handleSkip = useCallback(async () => {
    await skipReader();
    dialogs.ioReaderPicker.close();
  }, [skipReader, dialogs.ioReaderPicker]);

  // Close error dialog
  const handleCloseError = useCallback(() => {
    setError(null);
    dialogs.error.close();
  }, [setError, dialogs.error]);

  // Tab definitions
  const tabs: TabDefinition[] = useMemo(
    () => [
      { id: "query", label: "Query" },
      { id: "results", label: "Results", count: resultCount > 0 ? resultCount : undefined, countColor: "green" as const },
    ],
    [resultCount]
  );

  // Protocol badge for PostgreSQL
  const protocolBadges: ProtocolBadge[] = useMemo(
    () => (ioProfile ? [{ label: "PostgreSQL", color: "blue" as const }] : []),
    [ioProfile]
  );

  return (
    <AppLayout
      topBar={
        <QueryTopBar
          ioProfiles={postgresProfiles}
          ioProfile={ioProfile}
          defaultReadProfileId={settings?.default_read_profile}
          onOpenIoReaderPicker={() => dialogs.ioReaderPicker.open()}
          isStreaming={isStreaming}
          isStopped={isStopped}
          joinerCount={joinerCount}
          isDetached={isDetached}
          supportsTimeRange={capabilities?.supports_time_range ?? false}
          onStop={stopWatch}
          onResume={session.start}
          onDetach={handleDetach}
          onRejoin={handleRejoin}
        />
      }
    >
      {/* Tab view: Query Builder / Results */}
      <AppTabView
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        protocolLabel="DB"
        protocolBadges={protocolBadges}
        isStreaming={isStreaming}
        contentArea={{ className: "p-0" }}
      >
        {activeTab === "query" ? (
          <QueryBuilderPanel profileId={ioProfile} disabled={!ioProfile} />
        ) : (
          <ResultsPanel onIngestEvent={handleIngestAroundEvent} />
        )}
      </AppTabView>

      {/* IO Reader Picker Dialog - connect mode for database selection */}
      <IoReaderPickerDialog
        mode="connect"
        isOpen={dialogs.ioReaderPicker.isOpen}
        onClose={() => dialogs.ioReaderPicker.close()}
        ioProfiles={postgresProfiles}
        selectedId={ioProfile}
        defaultId={settings?.default_read_profile}
        onSelect={handleIoProfileChange}
        onConnect={handleConnect}
        onSkip={handleSkip}
      />

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={dialogs.error.isOpen || error !== null}
        title="Query Error"
        message={error || "An error occurred"}
        onClose={handleCloseError}
      />
    </AppLayout>
  );
}
