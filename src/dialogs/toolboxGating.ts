// Which Discovery toolbox tools a session offers, and whether they have data to work on.
//
// Kept apart from ToolboxDialog so the decision is testable without a DOM: it is a pure
// function of the session's shape, and it was previously wrong in a way no type caught.

/** The data a tool works on — what it needs to be offered, enabled and counted against. */
export type ToolNeeds = 'modbus' | 'serial-bytes' | 'serial-frames' | 'frames';

/** The requirement fields of a tool config; the rest (id, icon, label) is presentation. */
export interface ToolRequirements {
  serialRequires?: 'bytes' | 'frames';
  modbusRequires?: boolean;
}

export interface SessionShape {
  /** The source emits a raw byte stream. */
  isSerialMode: boolean;
  /** The session's protocol is serial, however it delivers its data. */
  isSerialProtocol: boolean;
  isModbusProfile: boolean;
}

export interface ToolDataCounts {
  frameCount: number;
  serialFrameCount: number;
  serialBytesCount: number;
}

export function toolNeeds(tool: ToolRequirements): ToolNeeds {
  if (tool.modbusRequires) return 'modbus';
  if (tool.serialRequires === 'bytes') return 'serial-bytes';
  if (tool.serialRequires === 'frames') return 'serial-frames';
  return 'frames';
}

/**
 * Whether this session could ever offer the tool. Whether the data is *there* is
 * `isToolAvailable` — a tool can be listed and still be disabled for want of frames.
 *
 * Serial Payload keys off the protocol, not off serial mode. Serial mode means "this
 * source emits a raw byte stream", which a source that frames in the backend (SLIP, say)
 * never does — so gating on it hid the framed-serial tool from exactly the sessions it
 * was written for.
 */
export function isToolApplicable(tool: ToolRequirements, session: SessionShape): boolean {
  switch (toolNeeds(tool)) {
    case 'modbus': return session.isModbusProfile;
    case 'serial-bytes': return session.isSerialMode;
    case 'serial-frames': return session.isSerialProtocol || session.isSerialMode;
    // Frame tools are meaningless while a serial source is still an unframed stream.
    case 'frames': return !session.isSerialMode;
  }
}

export function hasToolData(
  tool: ToolRequirements,
  session: SessionShape,
  counts: ToolDataCounts
): boolean {
  switch (toolNeeds(tool)) {
    case 'modbus': return session.isModbusProfile;
    case 'serial-bytes': return counts.serialBytesCount > 0;
    case 'serial-frames': return counts.serialFrameCount > 0;
    case 'frames': return counts.frameCount > 0;
  }
}
