// ui/src/apps/discovery/views/tools/MessageOrderToolPanel.tsx

import { useDiscoveryStore } from "../../../../stores/discoveryStore";

export default function MessageOrderToolPanel() {
  const options = useDiscoveryStore((s) => s.toolbox.messageOrder);
  const updateOptions = useDiscoveryStore((s) => s.updateMessageOrderOptions);

  return (
    <div className="space-y-2 text-xs">
      <div className="space-y-1">
        <label className="text-slate-500 dark:text-slate-400">
          Start Message ID <span className="text-slate-400 dark:text-slate-500">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="Auto-detect"
          value={options.startMessageId !== null ? `0x${options.startMessageId.toString(16).toUpperCase()}` : ""}
          onChange={(e) => {
            const val = e.target.value.trim();
            if (!val) {
              updateOptions({ startMessageId: null });
            } else {
              const parsed = parseInt(val, val.toLowerCase().startsWith("0x") ? 16 : 10);
              if (!isNaN(parsed)) {
                updateOptions({ startMessageId: parsed });
              }
            }
          }}
          className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-mono"
        />
        <p className="text-slate-400 dark:text-slate-500 text-[10px]">
          Leave empty to auto-detect from gap analysis
        </p>
      </div>
    </div>
  );
}
