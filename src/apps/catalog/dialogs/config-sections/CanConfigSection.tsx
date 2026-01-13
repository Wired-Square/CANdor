// ui/src/apps/catalog/dialogs/config-sections/CanConfigSection.tsx
// CAN protocol configuration section for unified config dialog

import { useState, useCallback, useMemo } from "react";
import { Network, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle, Check } from "lucide-react";
import type { CanHeaderFieldEntry } from "../../../../stores/catalogEditorStore";
import type { HeaderFieldFormat } from "../../types";
import MaskBitPicker from "../../../../components/MaskBitPicker";

/** Predefined CAN header field types */
type CanFieldType = "source_address" | "custom";

const CAN_FIELD_TYPE_OPTIONS: Array<{ value: CanFieldType; label: string }> = [
  { value: "source_address", label: "Source Address" },
  { value: "custom", label: "Custom" },
];

/** Parse a hex string like "0x000000FF" or "255" to a number */
function parseMaskString(maskStr: string): number {
  if (!maskStr) return 0;
  const trimmed = maskStr.trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return parseInt(trimmed, 16) || 0;
  }
  return parseInt(trimmed, 10) || 0;
}

/** Format a mask number as a hex string like "0x000000FF" */
function formatMaskHex(mask: number, shift: number = 0): string {
  const fullMask = (mask << shift) >>> 0;
  return `0x${fullMask.toString(16).toUpperCase().padStart(8, '0')}`;
}

/** Compute byte position info from mask for display */
function computeBitInfo(mask: number): string {
  if (mask === 0) return "no bits selected";

  // Find first and last set bit
  let firstBit = -1;
  let lastBit = -1;
  for (let i = 0; i < 32; i++) {
    if ((mask >> i) & 1) {
      if (firstBit === -1) firstBit = i;
      lastBit = i;
    }
  }

  if (firstBit === -1) return "no bits selected";

  const numBits = lastBit - firstBit + 1;
  return `${numBits} bit${numBits !== 1 ? 's' : ''} @ bit ${firstBit}`;
}

export type CanConfigSectionProps = {
  isConfigured: boolean;
  hasFrames: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAdd: () => void;
  onRemove: () => void;
  // Config values (only used when configured)
  defaultEndianness: "little" | "big";
  setDefaultEndianness: (endianness: "little" | "big") => void;
  defaultInterval: number | undefined;
  setDefaultInterval: (interval: number | undefined) => void;
  frameIdMask: string;
  setFrameIdMask: (mask: string) => void;
  headerFields: CanHeaderFieldEntry[];
  setHeaderFields: (fields: CanHeaderFieldEntry[]) => void;
};

export default function CanConfigSection({
  isConfigured,
  hasFrames,
  isExpanded,
  onToggleExpanded,
  onAdd,
  onRemove,
  defaultEndianness,
  setDefaultEndianness,
  defaultInterval,
  setDefaultInterval,
  frameIdMask,
  setFrameIdMask,
  headerFields,
  setHeaderFields,
}: CanConfigSectionProps) {
  // State for inline add form
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldType, setNewFieldType] = useState<CanFieldType>("source_address");
  const [newFieldCustomName, setNewFieldCustomName] = useState("");
  const [newFieldFormat, setNewFieldFormat] = useState<HeaderFieldFormat>("hex");

  // Track which existing fields have their bit picker expanded
  const [expandedFieldPickers, setExpandedFieldPickers] = useState<Record<number, boolean>>({});

  // State for frame ID mask bit picker
  const [showFrameIdMaskPicker, setShowFrameIdMaskPicker] = useState(false);
  const [useExtendedId, setUseExtendedId] = useState(true);

  // Check if source_address field already exists
  const hasSourceAddressField = useMemo(
    () => headerFields.some((f) => f.name.toLowerCase() === "source_address"),
    [headerFields]
  );

  const toggleFieldPicker = useCallback((index: number) => {
    setExpandedFieldPickers((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }, []);

  const resetAddForm = () => {
    setNewFieldType("source_address");
    setNewFieldCustomName("");
    setNewFieldFormat("hex");
    setIsAddingField(false);
  };

  const handleFrameIdMaskPickerChange = useCallback((mask: number, shift: number) => {
    const fullMask = (mask << shift) >>> 0;
    setFrameIdMask(`0x${fullMask.toString(16).toUpperCase().padStart(8, '0')}`);
  }, [setFrameIdMask]);

  const handleFieldMaskChange = useCallback((index: number, mask: number, shift: number) => {
    const fullMask = (mask << shift) >>> 0;
    handleUpdateField(index, { mask: formatMaskHex(fullMask, 0), shift });
  }, []);

  const handleAddField = () => {
    const name = newFieldType === "custom"
      ? newFieldCustomName.trim()
      : newFieldType;

    if (!name) return;

    // Default mask: 0xFF for source_address (bits 0-7), full mask for custom
    const defaultMask = newFieldType === "source_address" ? 0xFF : 0x1FFFFFFF;

    const newField: CanHeaderFieldEntry = {
      name,
      mask: formatMaskHex(defaultMask, 0),
      format: newFieldFormat,
    };

    setHeaderFields([...headerFields, newField]);

    // Auto-expand the bit picker for the new field
    setExpandedFieldPickers((prev) => ({
      ...prev,
      [headerFields.length]: true,
    }));

    resetAddForm();
  };

  const handleRemoveField = (index: number) => {
    setHeaderFields(headerFields.filter((_, i) => i !== index));
    // Clean up expanded state
    setExpandedFieldPickers((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const handleUpdateField = (index: number, updates: Partial<CanHeaderFieldEntry>) => {
    setHeaderFields(
      headerFields.map((field, i) =>
        i === index ? { ...field, ...updates } : field
      )
    );
  };

  // Filter field type options - disable source_address if already exists
  const availableFieldTypes = CAN_FIELD_TYPE_OPTIONS.map((opt) => ({
    ...opt,
    disabled: opt.value === "source_address" && hasSourceAddressField,
  }));

  // Status indicator
  const showWarning = hasFrames && !isConfigured;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggleExpanded(); }}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded">
            <Network className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <span className="font-medium text-slate-900 dark:text-white">CAN</span>
          {isConfigured && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="w-3 h-3" />
              configured
            </span>
          )}
          {showWarning && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              frames exist, no config
            </span>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {isConfigured ? (
            <button
              type="button"
              onClick={onRemove}
              className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && isConfigured && (
        <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
          {/* Default Byte Order */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Default Byte Order <span className="text-red-500">*</span>
            </label>
            <select
              value={defaultEndianness}
              onChange={(e) => setDefaultEndianness(e.target.value as "little" | "big")}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="little">Little Endian</option>
              <option value="big">Big Endian</option>
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Byte order used for multi-byte signals
            </p>
          </div>

          {/* Default Interval */}
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
              Default Interval (ms) <span className="text-slate-400 text-xs font-normal">(optional)</span>
            </label>
            <input
              type="number"
              min={0}
              value={defaultInterval ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setDefaultInterval(val === "" ? undefined : parseInt(val));
              }}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1000"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Default transmit interval for frames
            </p>
          </div>

          {/* Frame ID Mask */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                Frame ID Mask <span className="text-slate-400 text-xs font-normal">(optional, hex)</span>
              </label>
              <button
                type="button"
                onClick={() => setShowFrameIdMaskPicker(!showFrameIdMaskPicker)}
                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
              >
                {showFrameIdMaskPicker ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {showFrameIdMaskPicker ? "Hide" : "Show"} bit picker
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={frameIdMask}
                onChange={(e) => setFrameIdMask(e.target.value)}
                className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="0x1FFFFF00"
              />
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">ID type:</span>
                <select
                  value={useExtendedId ? "extended" : "standard"}
                  onChange={(e) => setUseExtendedId(e.target.value === "extended")}
                  className="w-24 px-1 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="CAN ID type"
                >
                  <option value="extended">29-bit</option>
                  <option value="standard">11-bit</option>
                </select>
              </div>
            </div>
            {showFrameIdMaskPicker && (
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <MaskBitPicker
                  mask={parseMaskString(frameIdMask)}
                  shift={0}
                  onMaskChange={handleFrameIdMaskPickerChange}
                  numBytes={4}
                  activeBits={useExtendedId ? 29 : 11}
                />
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Mask applied to frame ID before catalog matching. For J1939, use 0x1FFFFF00 to mask off the source address.
            </p>
          </div>

          {/* Header Fields Section */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                  Header Fields
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Extract named values from the CAN ID using bitmasks. The "Source Address" field enables per-source view.
                </p>
              </div>
              {!isAddingField && (
                <button
                  type="button"
                  onClick={() => setIsAddingField(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Field
                </button>
              )}
            </div>

            {/* Existing fields list */}
            {headerFields.length > 0 && (
              <div className="space-y-2 mb-3">
                {headerFields.map((field, index) => {
                  const isFieldExpanded = expandedFieldPickers[index] ?? false;
                  const fieldMask = parseMaskString(field.mask);
                  const fieldShift = field.shift ?? 0;
                  // For the bit picker, we need the unshifted mask
                  // If shift is stored, the mask was already stored as full mask, so we need to unshift
                  const unshiftedMask = fieldShift > 0 ? (fieldMask >>> fieldShift) : fieldMask;

                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        {/* Expand/collapse toggle */}
                        <button
                          type="button"
                          onClick={() => toggleFieldPicker(index)}
                          className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                          title={isFieldExpanded ? "Hide bit picker" : "Show bit picker"}
                        >
                          {isFieldExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>

                        {/* Field name */}
                        <span className="w-28 font-medium text-sm text-slate-900 dark:text-white truncate">
                          {field.name}
                        </span>

                        {/* Mask value */}
                        <input
                          type="text"
                          value={field.mask}
                          onChange={(e) => handleUpdateField(index, { mask: e.target.value })}
                          className="w-28 px-2 py-0.5 bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          title="Mask (hex)"
                        />

                        {/* Shift value input */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">&gt;&gt;</span>
                          <input
                            type="number"
                            min={0}
                            max={31}
                            value={fieldShift}
                            onChange={(e) => handleUpdateField(index, { shift: parseInt(e.target.value) || 0 })}
                            className="w-12 px-1 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
                            title="Right shift (bits)"
                          />
                        </div>

                        {/* Bit info */}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({computeBitInfo(fieldMask)})
                        </span>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Format */}
                        <select
                          value={field.format}
                          onChange={(e) => handleUpdateField(index, { format: e.target.value as HeaderFieldFormat })}
                          className="w-16 px-1 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="hex">Hex</option>
                          <option value="decimal">Dec</option>
                        </select>

                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveField(index)}
                          className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title="Remove field"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Expanded bit picker */}
                      {isFieldExpanded && (
                        <div className="ml-8 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          <MaskBitPicker
                            mask={unshiftedMask}
                            shift={fieldShift}
                            onMaskChange={(mask, shift) => handleFieldMaskChange(index, mask, shift)}
                            numBytes={4}
                            activeBits={useExtendedId ? 29 : 11}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new field form */}
            {isAddingField && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-3">
                  {/* Field type dropdown */}
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as CanFieldType)}
                    className="w-40 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {availableFieldTypes.map((opt) => (
                      <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                        {opt.label}{opt.disabled ? " (exists)" : ""}
                      </option>
                    ))}
                  </select>

                  {/* Custom name input (only shown for custom type) */}
                  {newFieldType === "custom" && (
                    <input
                      type="text"
                      value={newFieldCustomName}
                      onChange={(e) => setNewFieldCustomName(e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Field name"
                      autoFocus
                    />
                  )}

                  {/* Format */}
                  <select
                    value={newFieldFormat}
                    onChange={(e) => setNewFieldFormat(e.target.value as HeaderFieldFormat)}
                    className="w-16 px-1 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="hex">Hex</option>
                    <option value="decimal">Dec</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Use the bit picker after adding to select which CAN ID bits this field covers.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetAddForm}
                      className="px-3 py-1 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddField}
                      disabled={newFieldType === "custom" && !newFieldCustomName.trim()}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {headerFields.length === 0 && !isAddingField && (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                No header fields defined. Add a "Source Address" field to enable per-source view in the decoder.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Collapsed preview when configured but not expanded */}
      {!isExpanded && isConfigured && (
        <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
          Endianness: {defaultEndianness}
          {defaultInterval !== undefined && ` • Interval: ${defaultInterval}ms`}
          {frameIdMask && ` • Mask: ${frameIdMask}`}
          {headerFields.length > 0 && ` • ${headerFields.length} header field(s)`}
        </div>
      )}
    </div>
  );
}
