// Profile filtering utilities for bookmark creation
//
// Filters IO profiles based on their capabilities.

import type { IOProfile } from '../apps/settings/stores/settingsStore';

/**
 * Whether a profile kind is a database-backed recorded source — the WireTAP
 * backend supports time-range queries and a default speed.
 */
export function isTimeRangeCapableKind(kind: string | undefined): boolean {
  return kind === 'wiretap';
}

/**
 * Filter profiles to only those that support time range queries.
 * WireTAP backend profiles support this capability.
 */
export function getTimeRangeCapableProfiles(profiles: IOProfile[]): IOProfile[] {
  return profiles.filter(p => isTimeRangeCapableKind(p.kind));
}
