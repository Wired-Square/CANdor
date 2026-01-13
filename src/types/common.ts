// ui/src/types/common.ts
// Shared type definitions used across multiple components

/**
 * Frame information used in frame pickers and sidebars.
 * Represents metadata about a CAN frame for selection/display purposes.
 */
export type FrameInfo = {
  id: number;
  len: number;
  isExtended?: boolean;
  bus?: number;
  lenMismatch?: boolean;
};

/**
 * IO Profile configuration for data sources.
 */
export type IOProfile = {
  id: string;
  name: string;
  kind?: string;
  mode?: string;
};

/**
 * Frame ID display format options.
 */
export type FrameIdFormat = "hex" | "decimal";

/**
 * Time display format options for frame views.
 */
export type TimeDisplayFormat = "delta-last" | "delta-start" | "timestamp" | "human";
