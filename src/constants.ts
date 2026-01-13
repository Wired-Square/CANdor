// ui/src/constants.ts
// Global constants for the CANdor application
// Add new constants here for maintainability and single source of truth

// =============================================================================
// CAN Protocol Constants
// =============================================================================

/** Maximum data bytes for standard CAN frames */
export const CAN_MAX_BYTES = 8;

/** Maximum data bytes for CAN FD frames */
export const CAN_FD_MAX_BYTES = 64;

/** Valid DLC values for CAN FD frames (standard CAN uses 0-8) */
export const CAN_FD_DLC_VALUES = [8, 12, 16, 20, 24, 32, 48, 64] as const;
