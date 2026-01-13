// ui/src/apps/catalog/views/MuxView.tsx

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import ConfirmDeleteDialog from "../../../dialogs/ConfirmDeleteDialog";
import type { TomlNode } from "../types";

export type MuxViewProps = {
  selectedNode: TomlNode;
  onAddCase: (muxPath: string[]) => void;
  onEditMux: (muxPath: string[], muxData: any) => void;
  onDeleteMux: (muxPath: string[]) => void;
  onSelectNode: (node: TomlNode) => void;
};

export default function MuxView({
  selectedNode,
  onAddCase,
  onEditMux,
  onDeleteMux,
  onSelectNode,
}: MuxViewProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Mux Selector</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddCase(selectedNode.path)}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-medium"
          >
            + Add Case
          </button>

          <button
            onClick={() => onEditMux(selectedNode.path, selectedNode.metadata?.properties || {})}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit mux"
          >
            <Pencil className="w-4 h-4 text-slate-700 dark:text-slate-200" />
          </button>

          {/* Pattern A delete */}
          <button
            onClick={() => setConfirmOpen(true)}
            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            title="Delete mux"
          >
            <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Name</div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {selectedNode.metadata?.muxName || "N/A"}
          </div>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Start Bit</div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {selectedNode.metadata?.muxStartBit ?? "N/A"}
          </div>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Bit Length</div>
          <div className="font-mono text-sm text-slate-900 dark:text-white">
            {selectedNode.metadata?.muxBitLength ?? "N/A"}
          </div>
        </div>
      </div>

      {selectedNode.metadata?.properties?.notes && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Notes</div>
          <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {Array.isArray(selectedNode.metadata.properties.notes)
              ? selectedNode.metadata.properties.notes.join("\n")
              : selectedNode.metadata.properties.notes}
          </div>
        </div>
      )}

      {selectedNode.metadata?.muxDefaultCase && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Default Case</div>
          <div className="font-mono text-sm text-blue-900 dark:text-blue-300">
            {selectedNode.metadata.muxDefaultCase}
          </div>
        </div>
      )}

      {selectedNode.children && selectedNode.children.length > 0 && (
        <div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Cases ({selectedNode.children.length})
          </div>
          <div className="space-y-2">
            {selectedNode.children.map((caseNode, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                onClick={() => onSelectNode(caseNode)}
              >
                <div className="font-medium text-slate-900 dark:text-white">{caseNode.key}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Delete Mux"
        message="Are you sure you want to delete mux"
        highlightText={selectedNode.metadata?.muxName || undefined}
        confirmText="Delete"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDeleteMux(selectedNode.path);
        }}
      />
    </div>
  );
}
