// ui/src/utils/frameIds.ts

/**
 * Format a CAN frame id as hex or decimal with appropriate padding for extended IDs.
 */
export function formatFrameId(
  id: number,
  mode: "hex" | "decimal" = "hex",
  isExtended?: boolean
): string {
  if (mode === "decimal") return id.toString(10);
  const pad = isExtended ? 8 : 3;
  return `0x${id.toString(16).toUpperCase().padStart(pad, "0")}`;
}
