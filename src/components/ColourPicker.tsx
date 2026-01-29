// ui/src/components/ColourPicker.tsx

import { caption } from "../styles/typography";

type ColourPickerProps = {
  label: string;
  value: string;
  onChange: (val: string) => void;
};

export default function ColourPicker({ label, value, onChange }: ColourPickerProps) {
  return (
    <label className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-100">
      <span className="w-28">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 cursor-pointer bg-transparent border border-slate-300 dark:border-slate-600 rounded"
      />
      <span className={`${caption} font-mono`}>{value}</span>
    </label>
  );
}
