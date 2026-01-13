// ui/src/apps/catalog/views/ValueView.tsx

import type { TomlNode } from "../types";

export type ValueViewProps = {
  selectedNode: TomlNode;
};

export default function ValueView({ selectedNode }: ValueViewProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Value</div>
        <div className="font-mono text-sm text-slate-900 dark:text-white">
          {selectedNode.value === undefined ? "" : String(selectedNode.value)}
        </div>
      </div>
    </div>
  );
}
