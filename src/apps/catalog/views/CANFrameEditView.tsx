// ui/src/apps/catalog/views/CANFrameEditView.tsx

import type { CanidFields } from "../types";

export type CANFrameEditViewProps = {
  title?: string;
  subtitle?: string;

  idFields: CanidFields;
  setIdFields: (next: CanidFields) => void;

  availablePeers: string[];

  primaryActionLabel?: string;
  onCancel: () => void;
  onSave: () => void;

  disableSave?: boolean;
};

export default function CANFrameEditView({
  title = "Add New CAN Frame",
  subtitle = "Create a new CAN message definition",
  idFields,
  setIdFields,
  availablePeers,
  primaryActionLabel = "Add Frame",
  onCancel,
  onSave,
  disableSave,
}: CANFrameEditViewProps) {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="space-y-4">
        {/* ID - Required */}
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={idFields.id}
            onChange={(e) => setIdFields({ ...idFields, id: e.target.value })}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="0x123"
          />
        </div>

        {/* Length (DLC) - Required */}
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Length (DLC) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            max="64"
            value={idFields.length}
            onChange={(e) => setIdFields({ ...idFields, length: parseInt(e.target.value) || 0 })}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Transmitter (Peer) - Optional */}
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Transmitter (Peer)
          </label>
          <select
            value={idFields.transmitter || ""}
            onChange={(e) => setIdFields({ ...idFields, transmitter: e.target.value || undefined })}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">None</option>
            {availablePeers.map((peer) => (
              <option key={peer} value={peer}>
                {peer}
              </option>
            ))}
          </select>
        </div>

        {/* Interval (ms) - Optional */}
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Interval (ms)
          </label>
          <input
            type="number"
            min="0"
            value={idFields.interval !== undefined ? idFields.interval : ""}
            onChange={(e) =>
              setIdFields({
                ...idFields,
                interval: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="1000"
          />
        </div>

        {/* Notes - Optional */}
        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Notes
          </label>
          <textarea
            rows={4}
            value={
              Array.isArray(idFields.notes)
                ? idFields.notes.join("\n")
                : idFields.notes || ""
            }
            onChange={(e) => {
              const value = e.target.value;
              if (!value) {
                setIdFields({ ...idFields, notes: undefined });
              } else {
                const lines = value.split("\n");
                setIdFields({
                  ...idFields,
                  notes: lines.length === 1 ? lines[0] : lines,
                });
              }
            }}
            className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="Add notes about this frame (one per line)"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            disabled={disableSave || !idFields.id}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
