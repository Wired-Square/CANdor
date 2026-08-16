// ui/src/apps/discovery/components/checksumTone.tsx
//
// Match rate reads as a colour in both places checksum candidates are shown —
// the serial Apply list and the CAN discovery results. Same thresholds, one
// definition, so a 96% candidate is not green in one view and amber in the
// other.

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { iconLg } from "../../../styles/spacing";
import {
  bgInfo,
  bgSuccess,
  bgSurface,
  bgWarning,
  borderDefault,
  borderInfo,
  borderSuccess,
  borderWarning,
  textDataAmber,
  textDataGreen,
  textInfo,
  textMuted,
  textSuccess,
  textWarning,
} from "../../../styles/colourTokens";

/** Above this, a candidate is presented as the answer. */
export const MATCH_RATE_STRONG = 95;
/** Above this, worth showing but flagged. */
export const MATCH_RATE_WEAK = 80;

export function matchRateToneClasses(matchRate: number, isApplied = false): string {
  if (isApplied) return `${bgInfo} ${borderInfo}`;
  if (matchRate >= MATCH_RATE_STRONG) return `${bgSuccess} ${borderSuccess}`;
  if (matchRate >= MATCH_RATE_WEAK) return `${bgWarning} ${borderWarning}`;
  return `${bgSurface} ${borderDefault}`;
}

export function matchRateTextClass(matchRate: number): string {
  if (matchRate >= MATCH_RATE_STRONG) return `${textDataGreen} font-medium`;
  if (matchRate >= MATCH_RATE_WEAK) return textDataAmber;
  return "";
}

export function MatchRateIcon({
  matchRate,
  isApplied = false,
}: {
  matchRate: number;
  isApplied?: boolean;
}) {
  if (isApplied) return <CheckCircle2 className={`${iconLg} ${textInfo}`} />;
  if (matchRate >= MATCH_RATE_STRONG) return <CheckCircle2 className={`${iconLg} ${textSuccess}`} />;
  if (matchRate >= MATCH_RATE_WEAK) return <AlertCircle className={`${iconLg} ${textWarning}`} />;
  return <AlertCircle className={`${iconLg} ${textMuted}`} />;
}
