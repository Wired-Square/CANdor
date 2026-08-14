// ui/src/apps/discovery/hooks/useCaptureFrameView.ts
//
// Hook for capture-first frame display in Discovery app.
// Provides a unified interface for viewing frames from a capture,
// with tail polling during streaming and pagination when stopped.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  getCaptureFramesTail,
  getCaptureFramesPaginatedFiltered,
  findCaptureOffsetForTimestamp,
  getCaptureMetadataById,
  type CaptureFrame,
} from "../../../api/capture";
import { BUFFER_POLL_INTERVAL_MS } from "../../../constants";
import { useSessionStore } from "../../../stores/sessionStore";
import type { FrameMessage } from "../../../types/frame";
import { parseFrameKey } from "../../../utils/frameKey";

/** Frame with pre-computed hex bytes for display */
export type FrameWithHex = FrameMessage & { hexBytes: string[] };

export interface UseBufferFrameViewOptions {
  /** Buffer ID to read from (null = no buffer) */
  captureId: string | null;
  /** Owning session, used to refetch the live tail when Rust reports new frames. */
  sessionId?: string | null;
  /** Whether currently streaming (determines tail vs pagination mode) */
  isStreaming: boolean;
  /** Selected composite frame keys filter (empty = all) */
  selectedFrames: Set<string>;
  /** Page size for pagination (when stopped) */
  pageSize: number;
  /** Tail size for streaming mode (default: 50) */
  tailSize?: number;
  /** Poll interval for tail updates in ms (default: 200) */
  pollIntervalMs?: number;
  /** Buffer playback mode - uses pagination even when isStreaming is true */
  isCapturePlayback?: boolean;
  /** Hold the live tail still while frames keep arriving (the freeze toggle). */
  frozen?: boolean;
  /** When set, the hook auto-navigates to the page containing this timestamp during pagination mode.
   *  Used for play/play backward and stepping — the hook owns the page state so it handles navigation internally. */
  followTimeUs?: number | null;
}

export interface UseBufferFrameViewResult {
  /** Frames to display (either tail or current page) */
  frames: FrameWithHex[];
  /** 1-based original buffer position for each frame, parallel to `frames`. */
  captureIndices: number[];
  /** Total filtered frame count (for pagination info) */
  totalCount: number;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Current page (0-indexed, only meaningful when stopped) */
  currentPage: number;
  /** Set current page */
  setCurrentPage: (page: number) => void;
  /** Total pages (only meaningful when stopped) */
  totalPages: number;
  /** Buffer time range for timeline */
  timeRange: { startUs: number; endUs: number } | null;
  /** Navigate to timestamp (for timeline scrub) */
  navigateToTimestamp: (timeUs: number) => Promise<void>;
  /** Pull the tail once while frozen, without unfreezing. */
  refreshOnce: () => void;
}

/** Convert CaptureFrame to FrameMessage with hex bytes */
function addHexBytes(frames: CaptureFrame[]): FrameWithHex[] {
  return frames.map((f) => ({
    protocol: f.protocol,
    timestamp_us: f.timestamp_us,
    frame_id: f.frame_id,
    bus: f.bus,
    dlc: f.dlc,
    bytes: f.bytes,
    is_extended: f.is_extended,
    is_fd: f.is_fd,
    source_address: f.source_address,
    hexBytes: f.bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()),
  }));
}

/**
 * Hook for buffer-first frame display.
 *
 * - During streaming: Polls backend for latest N frames ("tail mode")
 * - When stopped: Standard pagination with page controls
 * - No large frontend frame arrays - all data stays in backend
 */
export function useCaptureFrameView(
  options: UseBufferFrameViewOptions
): UseBufferFrameViewResult {
  const {
    captureId,
    sessionId,
    isStreaming,
    selectedFrames,
    pageSize,
    tailSize = 50,
    pollIntervalMs = BUFFER_POLL_INTERVAL_MS,
    isCapturePlayback = false,
    frozen = false,
    followTimeUs,
  } = options;

  const [frames, setFrames] = useState<FrameWithHex[]>([]);
  const [captureIndices, setBufferIndices] = useState<number[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [timeRange, setTimeRange] = useState<{
    startUs: number;
    endUs: number;
  } | null>(null);
  // Pull the tail once without disturbing the subscription or the frozen flag.
  const fetchTailRef = useRef<() => void>(() => {});
  const refreshOnce = useCallback(() => fetchTailRef.current(), []);

  // Refs to avoid stale closures in intervals
  // Buffer API uses numeric IDs — extract from composite keys
  const selectedIdsRef = useRef<number[]>(Array.from(selectedFrames).map(fk => parseFrameKey(fk).frameId));
  const pageSizeRef = useRef(pageSize);

  // Update refs when values change
  useEffect(() => {
    selectedIdsRef.current = Array.from(selectedFrames).map(fk => parseFrameKey(fk).frameId);
  }, [selectedFrames]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  // Track buffer ID to detect switches
  const prevBufferIdRef = useRef<string | null>(null);

  // Reset state when buffer changes
  useEffect(() => {
    if (prevBufferIdRef.current !== captureId) {
      setFrames([]);
      setBufferIndices([]);
      setTotalCount(0);
      setCurrentPage(0);
      setTimeRange(null);
      prevBufferIdRef.current = captureId;
    }
  }, [captureId]);

  // Fetch buffer metadata for time range
  useEffect(() => {
    if (!captureId) {
      setTimeRange(null);
      return;
    }

    const fetchMetadata = async () => {
      try {
        const meta = await getCaptureMetadataById(captureId);
        if (meta && meta.start_time_us != null && meta.end_time_us != null) {
          setTimeRange({
            startUs: meta.start_time_us,
            endUs: meta.end_time_us,
          });
        }
      } catch (e) {
        console.error("[useCaptureFrameView] metadata fetch error:", e);
      }
    };

    fetchMetadata();
  }, [captureId]);

  // Read inside the fetch loop rather than through the effect deps, so toggling freeze
  // holds the rows that are on screen instead of tearing the subscription down and
  // pulling a fresh tail first.
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;

  useEffect(() => {
    if (!captureId || !isStreaming || isCapturePlayback) return;

    let isMounted = true;
    // A tail fetch can outlast the 500ms signal interval on a large capture. Skip while
    // one is in flight and run once more on completion, so fetches can neither queue up
    // on the DB mutex nor land out of order and overwrite newer rows with older ones.
    let inFlight = false;
    let missed = false;

    const fetchTail = async () => {
      if (inFlight) { missed = true; return; }
      inFlight = true;
      try {
        const response = await getCaptureFramesTail(captureId, tailSize, selectedIdsRef.current);
        if (!isMounted) return;
        setFrames(addHexBytes(response.frames));
        setBufferIndices(response.capture_indices);
        setTotalCount(response.total_filtered_count);
        if (response.capture_end_time_us != null) {
          setTimeRange((prev) => prev ? { ...prev, endUs: response.capture_end_time_us! } : null);
        }
      } catch (e) {
        console.error("[useCaptureFrameView] tail fetch error:", e);
      } finally {
        inFlight = false;
        if (missed && isMounted) { missed = false; void fetchTail(); }
      }
    };
    fetchTailRef.current = fetchTail;
    void fetchTail();

    // Rust writes frames into the capture before it signals, and it owns the frame count
    // it pushes over WS — so refetching whenever that count moves keeps the view in step
    // with the backend at the backend's own throttle, with no timer on this side.
    if (sessionId) {
      const unsubscribe = useSessionStore.subscribe((state, prevState) => {
        if (frozenRef.current) return;
        if (state.sessions[sessionId]?.frameCount !== prevState.sessions[sessionId]?.frameCount) {
          void fetchTail();
        }
      });
      return () => {
        isMounted = false;
        unsubscribe();
      };
    }

    // No session to follow — fall back to polling.
    const intervalId = setInterval(() => { if (!frozenRef.current) void fetchTail(); }, pollIntervalMs);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [captureId, isStreaming, isCapturePlayback, tailSize, pollIntervalMs, sessionId]);

  // PAGINATION MODE: Fetch page when stopped or during buffer playback
  useEffect(() => {
    // Run pagination when stopped, OR when in buffer playback mode
    if (!captureId || (isStreaming && !isCapturePlayback)) return;

    let isMounted = true;

    const fetchPage = async () => {
      setIsLoading(true);
      try {
        const offset = currentPage * pageSize;
        const response = await getCaptureFramesPaginatedFiltered(
          captureId,
          offset,
          pageSize,
          selectedIdsRef.current
        );
        if (!isMounted) return;

        const withHex = addHexBytes(response.frames);
        setFrames(withHex);
        setBufferIndices(response.capture_indices);
        setTotalCount(response.total_count);
      } catch (e) {
        console.error("[useCaptureFrameView] page fetch error:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPage();

    return () => {
      isMounted = false;
    };
  }, [captureId, isStreaming, isCapturePlayback, currentPage, pageSize, selectedFrames]);

  // Navigate to timestamp (for timeline scrub and step following)
  const navigateToTimestamp = useCallback(
    async (timeUs: number) => {
      // Only require a valid captureId - let callers decide when navigation is appropriate
      // This allows navigation when paused (isStreaming=true but stepping through frames)
      if (!captureId) return;

      try {
        // Ensure integer timestamp (backend expects u64)
        const timeUsInt = Math.round(timeUs);
        const offset = await findCaptureOffsetForTimestamp(
          captureId,
          timeUsInt,
          selectedIdsRef.current
        );
        const targetPage = Math.floor(offset / pageSizeRef.current);
        setCurrentPage(targetPage);
      } catch (e) {
        console.error("[useCaptureFrameView] timestamp navigation error:", e);
      }
    },
    [captureId]
  );

  // FOLLOW MODE: Auto-navigate to page containing followTimeUs during buffer playback
  // The hook owns the page state, so follow logic lives here (not in external effects)
  const followPendingRef = useRef(false);
  // Track the latest followTimeUs that was skipped while a navigation was pending.
  // When the pending navigation resolves, we re-check with this value so the page
  // catches up even if React already processed the latest followTimeUs change.
  const lastSkippedFollowRef = useRef<number | null>(null);
  // Use a ref for the "already on page" check so that manual page navigation
  // (which changes frames) doesn't re-trigger follow and snap the page back.
  const framesRef = useRef(frames);
  useEffect(() => { framesRef.current = frames; }, [frames]);

  // Shared follow-navigate helper used by both the effect and the catchup path.
  // `captureId` must be in the dep array — with an empty array the callback
  // would close over the initial `null` captureId and pass '' to the backend.
  const doFollowNavigate = useCallback((timeUs: number) => {
    if (!captureId) return;
    const timeUsInt = Math.round(timeUs);
    findCaptureOffsetForTimestamp(captureId, timeUsInt, selectedIdsRef.current)
      .then((offset) => {
        const targetPage = Math.floor(offset / pageSizeRef.current);
        setCurrentPage(targetPage);
      })
      .catch((e) => console.error("[useCaptureFrameView] follow navigation error:", e))
      .finally(() => {
        followPendingRef.current = false;
        // If timestamps were skipped while this navigation was pending, catch up
        const skipped = lastSkippedFollowRef.current;
        if (skipped != null) {
          lastSkippedFollowRef.current = null;
          followPendingRef.current = true;
          doFollowNavigate(skipped);
        }
      });
  }, [captureId]);

  useEffect(() => {
    if (followTimeUs == null || !captureId || !isCapturePlayback) return;
    if (followPendingRef.current) {
      // A navigation is in flight — record the latest timestamp so we can catch up
      lastSkippedFollowRef.current = followTimeUs;
      return;
    }

    // If we have frames, check whether the timestamp is already on the current page
    const currentFrames = framesRef.current;
    if (currentFrames.length > 0) {
      const firstTs = currentFrames[0].timestamp_us;
      const lastTs = currentFrames[currentFrames.length - 1].timestamp_us;
      if (followTimeUs >= firstTs && followTimeUs <= lastTs) return;
    }

    // Timestamp is outside the current page (or no frames loaded yet) — navigate
    followPendingRef.current = true;
    lastSkippedFollowRef.current = null;
    doFollowNavigate(followTimeUs);
  }, [followTimeUs, captureId, isCapturePlayback, doFollowNavigate]);

  // Track previous selection to detect actual changes
  const prevSelectedFramesRef = useRef<Set<string>>(selectedFrames);

  // Reset to page 0 when selection actually changes (not when streaming state changes)
  useEffect(() => {
    const prevSet = prevSelectedFramesRef.current;
    const changed =
      prevSet.size !== selectedFrames.size ||
      [...selectedFrames].some((fk) => !prevSet.has(fk));

    if (changed && captureId) {
      setCurrentPage(0);
      prevSelectedFramesRef.current = selectedFrames;
    }
  }, [selectedFrames, captureId]);

  // Calculate total pages
  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(totalCount / pageSize));
  }, [totalCount, pageSize]);

  return {
    frames,
    captureIndices,
    totalCount,
    isLoading,
    currentPage,
    setCurrentPage,
    totalPages,
    timeRange,
    navigateToTimestamp,
    refreshOnce,
  };
}
