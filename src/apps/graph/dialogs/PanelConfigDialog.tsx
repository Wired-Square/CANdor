// ui/src/apps/graph/dialogs/PanelConfigDialog.tsx

import { useState, useEffect, useCallback } from "react";
import { X, GripVertical, ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { iconLg, iconSm } from "../../../styles/spacing";
import { bgSurface, borderDivider, hoverLight, inputSimple, selectSimple, primaryButtonBase } from "../../../styles";
import { iconButtonHover, iconButtonDanger } from "../../../styles/buttonStyles";
import Dialog from "../../../components/Dialog";
import { useGraphStore, getSignalLabel, getConfidenceColour } from "../../../stores/graphStore";
import { useSettings } from "../../../hooks/useSettings";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  panelId: string | null;
  onAddSignals?: (panelId: string) => void;
  onReplaceSignal?: (panelId: string, signalIndex: number) => void;
}

export default function PanelConfigDialog({ isOpen, onClose, panelId, onAddSignals, onReplaceSignal }: Props) {
  const panels = useGraphStore((s) => s.panels);
  const updatePanel = useGraphStore((s) => s.updatePanel);
  const updateSignalColour = useGraphStore((s) => s.updateSignalColour);
  const updateSignalDisplayName = useGraphStore((s) => s.updateSignalDisplayName);
  const updateSignalYAxis = useGraphStore((s) => s.updateSignalYAxis);
  const reorderSignals = useGraphStore((s) => s.reorderSignals);
  const removeSignalFromPanel = useGraphStore((s) => s.removeSignalFromPanel);
  const { settings } = useSettings();

  const panel = panels.find((p) => p.id === panelId);

  const [title, setTitle] = useState("");
  const [minValue, setMinValue] = useState("0");
  const [maxValue, setMaxValue] = useState("100");
  const [primarySignalIndex, setPrimarySignalIndex] = useState("0");

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync local state when dialog opens (or switches to a different panel)
  useEffect(() => {
    if (panel) {
      setTitle(panel.title);
      setMinValue(String(panel.minValue));
      setMaxValue(String(panel.maxValue));
      setPrimarySignalIndex(String(panel.primarySignalIndex ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  // Reset drag state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setDragIndex(null);
      setDragOverIndex(null);
    }
  }, [isOpen]);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (panel && dragIndex !== null && dragIndex !== targetIndex) {
      reorderSignals(panel.id, dragIndex, targetIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [panel, dragIndex, reorderSignals]);

  if (!panel) {
    return null;
  }

  const handleSave = () => {
    // Strip trailing whitespace from display names before saving
    for (const signal of panel.signals) {
      const raw = signal.displayName;
      if (raw && raw !== raw.trimEnd()) {
        updateSignalDisplayName(panel.id, signal.frameId, signal.signalName, raw.trimEnd());
      }
    }

    updatePanel(panel.id, {
      title: title.trim() || panel.title,
      minValue: parseFloat(minValue) || 0,
      maxValue: parseFloat(maxValue) || 100,
      ...(panel.type === "gauge" ? { primarySignalIndex: parseInt(primarySignalIndex, 10) || 0 } : {}),
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
            Configure Panel
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
              className={`${inputSimple} w-full`}
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
                  type="text"
                  inputMode="decimal"
                  value={minValue}
                  onChange={(e) => setMinValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`${inputSimple} w-full`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">
                  Max Value
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className={`${inputSimple} w-full`}
                />
              </div>
            </div>
          )}

          {/* Primary signal selector (gauge with multiple signals) */}
          {panel.type === "gauge" && panel.signals.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-1">
                Primary Display Value
              </label>
              <select
                value={primarySignalIndex}
                onChange={(e) => setPrimarySignalIndex(e.target.value)}
                className={`${selectSimple} w-full`}
              >
                {panel.signals.map((sig, i) => (
                  <option key={`${sig.frameId}:${sig.signalName}`} value={String(i)}>
                    {getSignalLabel(sig)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Signals — drag reorder, colour, display name, replace */}
          {panel.signals.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[color:var(--text-secondary)] mb-2">
                Signals
              </label>
              <div className="space-y-1">
                {panel.signals.map((signal, index) => (
                  <div
                    key={`${signal.frameId}:${signal.signalName}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverIndex(index);
                    }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`flex items-center gap-2 rounded px-1 py-1 transition-colors ${
                      dragOverIndex === index ? "bg-[var(--hover-bg)]" : ""
                    } ${dragIndex === index ? "opacity-50" : ""}`}
                  >
                    {/* Drag handle */}
                    <div
                      draggable
                      onDragStart={(e) => {
                        setDragIndex(index);
                        e.dataTransfer.effectAllowed = "move";
                        // Use the parent row as drag image
                        const row = e.currentTarget.parentElement;
                        if (row) e.dataTransfer.setDragImage(row, 0, 0);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      className="cursor-grab active:cursor-grabbing shrink-0"
                      title="Drag to reorder"
                    >
                      <GripVertical className={`${iconSm} text-[color:var(--text-muted)]`} />
                    </div>

                    {panel.type !== "list" && (
                      <input
                        type="color"
                        value={signal.colour}
                        onChange={(e) =>
                          updateSignalColour(panel.id, signal.frameId, signal.signalName, e.target.value)
                        }
                        className="h-7 w-10 cursor-pointer bg-transparent border border-[color:var(--border-default)] rounded shrink-0"
                      />
                    )}
                    {/* Y-axis toggle (line-chart with 2+ signals) */}
                    {panel.type === "line-chart" && panel.signals.length >= 2 && (
                      <div className="flex shrink-0 rounded border border-[color:var(--border-default)] overflow-hidden">
                        <button
                          onClick={() => updateSignalYAxis(panel.id, signal.frameId, signal.signalName, 'left')}
                          className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            (signal.yAxis ?? 'left') === 'left'
                              ? 'bg-blue-600 text-white'
                              : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-bg)]'
                          }`}
                          title="Left Y-axis"
                        >
                          L
                        </button>
                        <button
                          onClick={() => updateSignalYAxis(panel.id, signal.frameId, signal.signalName, 'right')}
                          className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                            signal.yAxis === 'right'
                              ? 'bg-blue-600 text-white'
                              : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-bg)]'
                          }`}
                          title="Right Y-axis"
                        >
                          R
                        </button>
                      </div>
                    )}
                    <input
                      type="text"
                      value={signal.displayName ?? ""}
                      onChange={(e) =>
                        updateSignalDisplayName(panel.id, signal.frameId, signal.signalName, e.target.value)
                      }
                      placeholder={signal.signalName}
                      className={`${inputSimple} flex-1 text-sm`}
                    />
                    {/* Confidence indicator */}
                    {signal.confidence && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: getConfidenceColour(signal.confidence, settings) }}
                        title={`Confidence: ${signal.confidence}`}
                      />
                    )}
                    {/* Replace signal source */}
                    {onReplaceSignal && (
                      <button
                        onClick={() => onReplaceSignal(panel.id, index)}
                        className={`${iconButtonHover} p-1 shrink-0`}
                        title="Change signal source"
                      >
                        <ArrowLeftRight className={iconSm} />
                      </button>
                    )}
                    {/* Remove signal */}
                    <button
                      onClick={() => removeSignalFromPanel(panel.id, signal.frameId, signal.signalName)}
                      className={`${iconButtonDanger} p-1 shrink-0`}
                      title="Remove signal"
                    >
                      <Trash2 className={iconSm} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {onAddSignals && (
              <button
                onClick={() => onAddSignals(panel.id)}
                className={`${iconButtonHover} flex items-center gap-1.5 px-3 py-2 rounded text-sm text-[color:var(--text-secondary)] border border-[var(--border-default)]`}
                title="Add signals"
              >
                <Plus className={iconSm} />
                Add Signals
              </button>
            )}
            <button
              onClick={handleSave}
              className={`${primaryButtonBase} flex-1`}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
