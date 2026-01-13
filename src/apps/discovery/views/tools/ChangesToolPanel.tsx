// ui/src/apps/discovery/views/tools/ChangesToolPanel.tsx

import { useDiscoveryStore } from "../../../../stores/discoveryStore";

export default function ChangesToolPanel() {
  const options = useDiscoveryStore((s) => s.toolbox.changes);
  const updateOptions = useDiscoveryStore((s) => s.updateChangesOptions);

  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        <label className="text-slate-500 dark:text-slate-400">Max Change Examples</label>
        <input
          type="number"
          min={1}
          max={100}
          value={options.maxExamples}
          onChange={(e) => updateOptions({ maxExamples: Math.max(1, Math.min(100, Number(e.target.value) || 30)) })}
          className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
        />
      </div>
      <p className="text-slate-400 dark:text-slate-500">
        Maximum unique payload samples to analyse per frame ID.
      </p>
    </div>
  );
}
