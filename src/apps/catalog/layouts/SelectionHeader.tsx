// ui/src/apps/catalog/layout/SelectionHeader.tsx

import { Link2 } from "lucide-react";
import { iconXl, flexRowGap2 } from "../../../styles/spacing";
import type { TomlNode } from "../types";

export type SelectionHeaderProps = {
  selectedNode: TomlNode;
  formatFrameId?: (id: string) => { primary: string; secondary?: string };
};

function labelForNodeType(type: TomlNode["type"]): string {
  switch (type) {
    case "section":
      return "Table";
    case "table-array":
      return "Signals";
    case "signal":
      return "Signal";
    case "array":
      return "Array";
    case "meta":
      return "Metadata";
    case "can-frame":
      return "CAN Frame";
    case "modbus-frame":
      return "Modbus Frame";
    case "node":
      return "Peer";
    case "value":
      return "Value";
    case "mux":
      return "Mux";
    case "mux-case":
      return "Mux Case";
    case "inline-table":
      return "Inline Table";
    default:
      return type;
  }
}

export default function SelectionHeader({ selectedNode, formatFrameId }: SelectionHeaderProps) {
  const isCanFrame = selectedNode.type === "can-frame";
  const idLabel = isCanFrame && formatFrameId ? formatFrameId(selectedNode.key) : null;

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
        {selectedNode.metadata?.isCopy && (
          <span title={`Copied from ${selectedNode.metadata?.copyFrom}`}>
            <Link2 className={`${iconXl} text-blue-500 dark:text-blue-400`} />
          </span>
        )}
        {idLabel ? (
          <span className={flexRowGap2}>
            <span>{idLabel.primary}</span>
            {idLabel.secondary && (
              <span className="text-slate-500 dark:text-slate-400 text-lg">({idLabel.secondary})</span>
            )}
          </span>
        ) : (
          selectedNode.key
        )}
      </h2>

      <div className={`${flexRowGap2} text-sm text-slate-600 dark:text-slate-400`}>
        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">{labelForNodeType(selectedNode.type)}</span>
        <span className="font-mono text-xs">{selectedNode.path.join(".")}</span>
        {selectedNode.metadata?.isCopy && (
          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
            Copy of {selectedNode.metadata?.copyFrom}
          </span>
        )}
      </div>
    </div>
  );
}
