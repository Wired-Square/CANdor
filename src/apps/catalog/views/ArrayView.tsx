// ui/src/apps/catalog/views/ArrayView.tsx

import type { TomlNode } from "../types";

export type ArrayViewProps = {
  selectedNode: TomlNode;
};

export default function ArrayView({ selectedNode }: ArrayViewProps) {
  const items = selectedNode.metadata?.arrayItems || [];

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Items ({items.length})
      </div>
      <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
        {items.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">No items</div>
        ) : (
          <ul className="space-y-1">
            {items.map((item: any, idx: number) => (
              <li key={idx} className="font-mono text-sm text-slate-900 dark:text-white">
                {typeof item === "string" ? `"${item}"` : JSON.stringify(item)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
