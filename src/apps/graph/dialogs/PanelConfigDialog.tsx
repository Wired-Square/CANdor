// ui/src/apps/graph/dialogs/PanelConfigDialog.tsx

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { iconLg } from "../../../styles/spacing";
import { bgSurface, borderDivider, hoverLight, inputBase } from "../../../styles";
import Dialog from "../../../components/Dialog";
import { useGraphStore } from "../../../stores/graphStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  panelId: string | null;
}

export default function PanelConfigDialog({ isOpen, onClose, panelId }: Props) {
  const panels = useGraphStore((s) => s.panels);
  const updatePanel = useGraphStore((s) => s.updatePanel);

  const panel = panels.find((p) => p.id === panelId);

  const [title, setTitle] = useState("");
  const [minValue, setMinValue] = useState("0");
  const [maxValue, setMaxValue] = useState("100");

  // Sync local state when panel changes
  useEffect(() => {
    if (panel) {
      setTitle(panel.title);
      setMinValue(String(panel.minValue));
      setMaxValue(String(panel.maxValue));
    }
  }, [panel]);

  if (!panel) {
    return null;
  }

  const handleSave = () => {
    updatePanel(panel.id, {
      title: title.trim() || panel.title,
      minValue: parseFloat(minValue) || 0,
      maxValue: parseFloat(maxValue) || 100,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-sm">
      <div className={`${bgSurface} rounded-xl shadow-xl overflow-hidden`}>
        {/* Header */}
        <div className={`p-4 ${borderDivider} flex items-center justify-between`}>
          <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">
            Panel Settings
          </h2>
          <button
            onClick={onClose}
            className={`p-1 rounded ${hoverLight} transition-colors`}
          >
            <X className={iconLg} />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className={`${inputBase} w-full`}
              placeholder="Panel title"
            />
          </div>

          {/* Gauge range (only for gauge panels) */}
          {panel.type === "gauge" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">
                  Min Value
                </label>
                <input
                  type="number"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`${inputBase} w-full`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">
                  Max Value
                </label>
                <input
                  type="number"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`${inputBase} w-full`}
                />
              </div>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  );
}
