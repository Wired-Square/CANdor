/**
 * Composite frame key utilities.
 *
 * Frame identity is (protocol, frame_id) — e.g. CAN ID 0x100 and Modbus
 * register 256 are distinct even though both have numeric ID 256.
 *
 * Keys are encoded as "protocol:numericId" strings for use as Map keys
 * and Set members.
 */

/** Build a composite key from protocol name and numeric frame ID. */
export function frameKey(protocol: string, frameId: number): string {
  return `${protocol}:${frameId}`;
}

/** Extract protocol and numeric frame ID from a composite key. */
export function parseFrameKey(key: string): { protocol: string; frameId: number } {
  const idx = key.indexOf(":");
  return { protocol: key.slice(0, idx), frameId: Number(key.slice(idx + 1)) };
}

/** Build a composite key from a FrameMessage-shaped object. */
export function keyOf(frame: { protocol: string; frame_id: number }): string {
  return `${frame.protocol}:${frame.frame_id}`;
}

/**
 * Stable React key for a row in a frame table.
 *
 * Distinct from `keyOf` above: that is *frame identity* (which signal this is), this is
 * *row identity* (which row on screen). Frames carry no identity of their own —
 * (timestamp, id, bus) collides whenever a source emits the same ID more than once in the
 * same microsecond, and a duplicate key makes React's reconciler orphan rows it can no
 * longer remove, so they accumulate on every render.
 *
 * Prefer the backend's per-row position (a SQLite rowid); fall back to the row's position
 * in the paged list. The two are namespaced because both are small integers.
 */
export function frameRowKey(captureIndex: number | undefined, position: number): string {
  return captureIndex != null ? `cap:${captureIndex}` : `pos:${position}`;
}
