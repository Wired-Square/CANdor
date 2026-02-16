// ui/src/apps/discovery/views/tools/ChecksumDiscoveryToolPanel.tsx

import { useDiscoveryStore } from "../../../../stores/discoveryStore";
import { bgSurface } from "../../../../styles";

export default function ChecksumDiscoveryToolPanel() {
  const options = useDiscoveryStore((s) => s.toolbox.checksumDiscovery);
  const updateOptions = useDiscoveryStore((s) => s.updateChecksumDiscoveryOptions);

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1">
        <label className="text-[color:var(--text-muted)]">Minimum Samples per Frame ID</label>
        <input
          type="number"
          min={5}
          max={50}
          value={options.minSamples}
          onChange={(e) => updateOptions({ minSamples: Math.max(5, Math.min(50, Number(e.target.value) || 10)) })}
          className={`w-full px-2 py-1 rounded border border-[color:var(--border-default)] ${bgSurface} text-[color:var(--text-primary)]`}
        />
      </div>

      <div className="space-y-1">
        <label className="text-[color:var(--text-muted)]">Match Threshold (%)</label>
        <input
          type="number"
          min={80}
          max={100}
          value={options.minMatchRate}
          onChange={(e) => updateOptions({ minMatchRate: Math.max(80, Math.min(100, Number(e.target.value) || 95)) })}
          className={`w-full px-2 py-1 rounded border border-[color:var(--border-default)] ${bgSurface} text-[color:var(--text-primary)]`}
        />
      </div>

      <div className="space-y-2">
        <label className="text-[color:var(--text-muted)]">Options</label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.trySimpleFirst}
            onChange={(e) => updateOptions({ trySimpleFirst: e.target.checked })}
            className="rounded"
          />
          <span className="text-[color:var(--text-secondary)]">Try XOR/Sum8 first</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={options.bruteForceCrc16}
            onChange={(e) => updateOptions({ bruteForceCrc16: e.target.checked })}
            className="rounded"
          />
          <span className="text-[color:var(--text-secondary)]">Brute-force CRC-16 polynomials</span>
        </label>
      </div>

      <p className="text-[color:var(--text-muted)] pt-2 border-t border-[color:var(--border-default)]">
        Detects checksum algorithms per frame ID. Tests XOR, Sum8, known CRCs, and arbitrary polynomials.
        Frame ID inclusion is tested automatically.
      </p>
    </div>
  );
}
