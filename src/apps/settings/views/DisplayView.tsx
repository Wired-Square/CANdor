// ui/src/apps/settings/views/DisplayView.tsx

import ColourPicker from "../../../components/ColourPicker";
import { flexRowGap2 } from "../../../styles/spacing";
import { textMedium } from "../../../styles";

type DisplayViewProps = {
  displayFrameIdFormat: "hex" | "decimal";
  onChangeFormat: (format: "hex" | "decimal") => void;
  displayTimeFormat: "delta-last" | "delta-start" | "timestamp" | "human";
  onChangeTimeFormat: (fmt: "delta-last" | "delta-start" | "timestamp" | "human") => void;
  timezone: "local" | "utc";
  onChangeTimezone: (tz: "local" | "utc") => void;
  signalColours: {
    none: string;
    low: string;
    medium: string;
    high: string;
  };
  onChangeSignalColour: (level: "none" | "low" | "medium" | "high", val: string) => void;
  onResetSignalColour: (level: "none" | "low" | "medium" | "high") => void;
  binaryOneColour: string;
  onChangeBinaryOneColour: (val: string) => void;
  onResetBinaryOneColour: () => void;
  binaryZeroColour: string;
  onChangeBinaryZeroColour: (val: string) => void;
  onResetBinaryZeroColour: () => void;
  binaryUnusedColour: string;
  onChangeBinaryUnusedColour: (val: string) => void;
  onResetBinaryUnusedColour: () => void;
};

export default function DisplayView({
  displayFrameIdFormat,
  onChangeFormat,
  displayTimeFormat,
  onChangeTimeFormat,
  timezone,
  onChangeTimezone,
  signalColours,
  onChangeSignalColour,
  onResetSignalColour,
  binaryOneColour,
  onChangeBinaryOneColour,
  onResetBinaryOneColour,
  binaryZeroColour,
  onChangeBinaryZeroColour,
  onResetBinaryZeroColour,
  binaryUnusedColour,
  onChangeBinaryUnusedColour,
  onResetBinaryUnusedColour,
}: DisplayViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Display</h2>
      </div>

      <div className="space-y-2">
        <label className={`block ${textMedium}`}>
          Display Frame ID as
        </label>
        <div className="flex gap-3">
          <label className={`${flexRowGap2} text-sm text-slate-800 dark:text-slate-100`}>
            <input
              type="radio"
              name="frame-id-format"
              value="hex"
              checked={displayFrameIdFormat === "hex"}
              onChange={() => onChangeFormat("hex")}
            />
            Hex
          </label>
          <label className={`${flexRowGap2} text-sm text-slate-800 dark:text-slate-100`}>
            <input
              type="radio"
              name="frame-id-format"
              value="decimal"
              checked={displayFrameIdFormat === "decimal"}
              onChange={() => onChangeFormat("decimal")}
            />
            Decimal
          </label>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose how CAN frame IDs are shown in the editor.
        </p>
      </div>

      <div className="space-y-2">
        <label className={`block ${textMedium}`}>
          Display time as
        </label>
        <div className="flex flex-wrap gap-3">
          {[
            { value: "human", label: "Human friendly" },
            { value: "timestamp", label: "Timestamp" },
            { value: "delta-start", label: "Delta since start" },
            { value: "delta-last", label: "Delta since last message" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input
                type="radio"
                name="time-format"
                value={opt.value}
                checked={displayTimeFormat === opt.value}
                onChange={() => onChangeTimeFormat(opt.value as DisplayViewProps["displayTimeFormat"])}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Controls how timestamps are rendered in discovery and other views.
        </p>
      </div>

      <div className="space-y-2">
        <label className={`block ${textMedium}`}>
          Default timezone
        </label>
        <div className="flex gap-3">
          {[
            { value: "local", label: "Local timezone" },
            { value: "utc", label: "UTC" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input
                type="radio"
                name="timezone"
                value={opt.value}
                checked={timezone === opt.value}
                onChange={() => onChangeTimezone(opt.value as "local" | "utc")}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Default timezone for clock displays. Click the timezone badge in views to temporarily override.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Signals</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure colors for signal confidence indicators.
        </p>
        <div className="space-y-2">
          {([
            { key: "none", label: "No confidence", defaultVal: "#94a3b8" },
            { key: "low", label: "Low confidence", defaultVal: "#f59e0b" },
            { key: "medium", label: "Medium confidence", defaultVal: "#3b82f6" },
            { key: "high", label: "High confidence", defaultVal: "#22c55e" },
          ] as const).map((cfg) => (
            <div key={cfg.key} className={flexRowGap2}>
              <ColourPicker
                label={cfg.label}
                value={signalColours[cfg.key]}
                onChange={(val) => onChangeSignalColour(cfg.key, val)}
              />
              <button
                type="button"
                onClick={() => onResetSignalColour(cfg.key)}
                className="p-2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                title="Reset to default"
              >
                ↺
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Binary Display</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure colors for binary bits in the Frame Calculator and bit previews.
        </p>
        <div className="space-y-2">
          <div className={flexRowGap2}>
            <ColourPicker
              label="Binary 1 colour"
              value={binaryOneColour}
              onChange={onChangeBinaryOneColour}
            />
            <button
              type="button"
              onClick={onResetBinaryOneColour}
              className="p-2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
              title="Reset to default"
            >
              ↺
            </button>
          </div>
          <div className={flexRowGap2}>
            <ColourPicker
              label="Binary 0 colour"
              value={binaryZeroColour}
              onChange={onChangeBinaryZeroColour}
            />
            <button
              type="button"
              onClick={onResetBinaryZeroColour}
              className="p-2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
              title="Reset to default"
            >
              ↺
            </button>
          </div>
          <div className={flexRowGap2}>
            <ColourPicker
              label="Unused bits colour"
              value={binaryUnusedColour}
              onChange={onChangeBinaryUnusedColour}
            />
            <button
              type="button"
              onClick={onResetBinaryUnusedColour}
              className="p-2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
              title="Reset to default"
            >
              ↺
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
