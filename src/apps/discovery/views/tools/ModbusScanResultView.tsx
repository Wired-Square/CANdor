// ui/src/apps/discovery/views/tools/ModbusScanResultView.tsx
//
// A discovered register map is unreadable as raw hex. The whole point of the
// scan is to spot that 0x0938 next to a 0x01F4 is 236.0 V beside 50.0 Hz, and
// that needs the same value shown several ways at once — which is exactly what
// the throwaway scripts this feature replaces printed.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { ModbusScanResults } from "../../../../stores/discoveryToolboxStore";
import {
  useDiscoveryFrameStore,
  getLastFrameDataMap,
} from "../../../../stores/discoveryFrameStore";
import {
  bgDataView,
  borderDefault,
  emptyStateContainer,
  emptyStateText,
  textMuted,
  textPrimary,
  textSecondary,
} from "../../../../styles";
import { iconSm } from "../../../../styles/spacing";
import { bytesToHex } from "../../../../utils/byteUtils";
import { parseFrameKey } from "../../../../utils/frameKey";
import { interpretPair, interpretRegister, type WordOrder } from "../../../../utils/modbusValues";
import CheckboxField from "../../../../components/forms/CheckboxField";

type Props = {
  results: ModbusScanResults;
  onClose: () => void;
  onCancel?: () => void;
  /**
   * Put the device back on the bus. A sweep frees the socket by stopping the
   * session that was polling it, and without a way back that would be a one-way
   * door — you would have to rebuild the source by hand.
   *
   * Takes the session id rather than reading it back from the store: both scan
   * tabs render this view, so only the tab holding the button knows which of
   * them stopped a session.
   */
  onResumePolling?: (polledSessionId: string) => void;
};

/** One discovered address and its most recent value. */
type ScanRow = { address: number; bytes: number[]; bus: number };

const th = (muted: string) => `text-left px-3 py-1.5 ${muted} font-medium`;
const td = (tone: string) => `px-3 py-1 ${tone} font-mono`;

export default function ModbusScanResultView({
  results,
  onClose,
  onCancel,
  onResumePolling,
}: Props) {
  const { t } = useTranslation("discovery");
  const { scanType, isScanning, progress, deviceInfo, notes, polledSessionId, polledProfileName } =
    results;
  const hasDeviceInfo = deviceInfo.size > 0;

  const [wordOrder, setWordOrder] = useState<WordOrder>("big");
  const [showWide, setShowWide] = useState(false);

  // Discovery joins the scan session, so its frames stream into the shared
  // frame store like any other source's — and the store already keeps the
  // latest value per frame key, maintained incrementally on each flush. Reading
  // that is free; re-querying the capture would refetch every row twice a second
  // to rebuild the same map, while contending with the sweep still writing to it.
  const frameVersion = useDiscoveryFrameStore((s) => s.frameVersion);

  // A repeated sweep writes each register once per pass; the table shows the
  // current value, and what changed between passes is the Changes tool's job.
  const { rows, byAddress } = useMemo(() => {
    const byAddress = new Map<number, ScanRow>();
    for (const [key, data] of getLastFrameDataMap()) {
      const { protocol, frameId } = parseFrameKey(key);
      if (protocol !== "modbus") continue;
      byAddress.set(frameId, { address: frameId, bytes: data.bytes, bus: data.bus });
    }
    const rows = [...byAddress.values()].sort((a, b) => a.address - b.address);
    return { rows, byAddress };
    // frameVersion is the store's reactivity counter for its mutable buffers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameVersion]);

  return (
    <div className={`flex flex-col h-full ${bgDataView}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${borderDefault}`}>
        <div className="flex items-center gap-3">
          <h3 className={`text-sm font-medium ${textPrimary}`}>
            {scanType === "register"
              ? t("modbusScan.registerScanTitle")
              : t("modbusScan.unitIdScanTitle")}
          </h3>
          {isScanning && progress && (
            <span className={`text-xs ${textMuted}`}>
              {t("modbusScan.scanningProgress", {
                current: progress.current,
                total: progress.total,
                found: progress.found_count,
              })}
              {progress.total_passes > 1 &&
                ` ${t("modbusScan.passOf", {
                  pass: progress.pass,
                  total: progress.total_passes,
                })}`}
            </span>
          )}
          {!isScanning && (
            <span className={`text-xs ${textMuted}`}>
              {scanType === "register"
                ? t("modbusScan.registersFound", { count: rows.length })
                : t("modbusScan.devicesFound", { count: rows.length })}
              {hasDeviceInfo && ` ${t("modbusScan.identified", { count: deviceInfo.size })}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {scanType === "register" && rows.length > 0 && (
            <>
              <CheckboxField
                checked={showWide}
                onChange={setShowWide}
                label={t("modbusScan.show32Bit")}
                labelClass={textMuted}
              />
              {showWide && (
                <select
                  value={wordOrder}
                  onChange={(e) => setWordOrder(e.target.value as WordOrder)}
                  className={`px-1 py-0.5 rounded border ${borderDefault} bg-[var(--bg-surface)] ${textSecondary}`}
                  title={t("modbusScan.wordOrder")}
                >
                  <option value="big">{t("modbusScan.wordOrderBig")}</option>
                  <option value="little">{t("modbusScan.wordOrderLittle")}</option>
                </select>
              )}
            </>
          )}
          {isScanning && onCancel && (
            <button
              onClick={onCancel}
              className={`px-2 py-0.5 rounded hover:bg-red-600 hover:text-white transition-colors ${textMuted}`}
            >
              {t("modbusScan.cancel")}
            </button>
          )}
          {!isScanning && onResumePolling && polledSessionId && polledProfileName && (
            <button
              onClick={() => onResumePolling(polledSessionId)}
              className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              {t("modbusScan.resumePolling", { device: polledProfileName })}
            </button>
          )}
          {!isScanning && (
            <button onClick={onClose} className={`${textMuted} hover:${textPrimary}`} title={t("modbusScan.close")}>
              <X className={iconSm} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isScanning && progress && progress.total > 0 && (
        <div className="h-1 bg-[var(--bg-surface)]">
          <div
            className="h-full bg-purple-500 transition-all duration-200"
            style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
          />
        </div>
      )}

      {/* Diagnoses — a silent function code is a finding, not an error */}
      {notes.length > 0 && (
        <div className={`px-4 py-1.5 border-b ${borderDefault} space-y-0.5`}>
          {notes.map((note, i) => (
            <p key={i} className="text-xs text-amber-500">
              {note}
            </p>
          ))}
        </div>
      )}

      {/* Results table */}
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className={emptyStateContainer}>
            <p className={emptyStateText}>
              {isScanning ? t("modbusScan.scanning") : t("modbusScan.noResults")}
            </p>
          </div>
        ) : scanType === "unit-id" ? (
          <table className="w-full text-xs">
            <thead className={`sticky top-0 ${bgDataView}`}>
              <tr className={`border-b ${borderDefault}`}>
                <th className={th(textMuted)}>{t("modbusScan.tableUnitId")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableVendor")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableProduct")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableRevision")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableData")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const info = deviceInfo.get(row.bus);
                return (
                  <tr
                    key={`${row.address}-${row.bus}`}
                    className="border-b border-[color:var(--border-default)]/30 hover:bg-[var(--bg-surface)]"
                  >
                    <td className={td(textSecondary)}>{row.bus}</td>
                    <td className={`px-3 py-1 ${textPrimary}`}>{info?.vendor ?? t("modbusScan.noValue")}</td>
                    <td className={`px-3 py-1 ${textSecondary}`}>{info?.product_code ?? t("modbusScan.noValue")}</td>
                    <td className={`px-3 py-1 ${textMuted}`}>{info?.revision ?? t("modbusScan.noValue")}</td>
                    <td className={td(textMuted)}>
                      {row.bytes.length > 0 ? bytesToHex(row.bytes) : t("modbusScan.noValue")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className={`sticky top-0 ${bgDataView}`}>
              <tr className={`border-b ${borderDefault}`}>
                <th className={th(textMuted)}>{t("modbusScan.tableRegister")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableHex")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableU16")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableS16")}</th>
                <th className={th(textMuted)}>{t("modbusScan.tableAscii")}</th>
                {showWide && (
                  <>
                    <th className={th(textMuted)}>{t("modbusScan.tableU32")}</th>
                    <th className={th(textMuted)}>{t("modbusScan.tableS32")}</th>
                    <th className={th(textMuted)}>{t("modbusScan.tableF32")}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const v = interpretRegister(row.bytes);
                // The 32-bit reading pairs this register with the next one, and
                // only means anything if that neighbour was actually found.
                const next = byAddress.get(row.address + 1);
                const wide = next ? interpretPair(row.bytes, next.bytes, wordOrder) : null;
                return (
                  <tr
                    key={`${row.bus}-${row.address}`}
                    className="border-b border-[color:var(--border-default)]/30 hover:bg-[var(--bg-surface)]"
                  >
                    <td className={td(textPrimary)}>{row.address}</td>
                    <td className={td(textMuted)}>{v.hex}</td>
                    <td className={td(textSecondary)}>{v.u16}</td>
                    <td className={td(textSecondary)}>{v.s16}</td>
                    <td className={td(textMuted)}>{v.ascii}</td>
                    {showWide && (
                      <>
                        <td className={td(textSecondary)}>{wide?.u32 ?? ""}</td>
                        <td className={td(textSecondary)}>{wide?.s32 ?? ""}</td>
                        <td className={td(textMuted)}>
                          {wide ? formatFloat(wide.f32) : ""}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Keep float columns narrow: absurd exponents are the tell-tale of a wrong word order. */
function formatFloat(f: number): string {
  if (!Number.isFinite(f)) return "—";
  const abs = Math.abs(f);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e9)) return f.toExponential(3);
  return f.toFixed(3);
}
