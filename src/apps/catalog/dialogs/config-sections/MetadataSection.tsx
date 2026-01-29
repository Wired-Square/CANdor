// ui/src/apps/catalog/dialogs/config-sections/MetadataSection.tsx
// Catalog metadata section for unified config dialog

import { textMedium, focusRing } from "../../../../styles";

export type MetadataSectionProps = {
  name: string;
  setName: (name: string) => void;
  version: number;
  setVersion: (version: number) => void;
};

export default function MetadataSection({
  name,
  setName,
  version,
  setVersion,
}: MetadataSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">
        Catalog Metadata
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block ${textMedium} mb-2`}>
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white ${focusRing}`}
            placeholder="My Catalog"
          />
        </div>
        <div>
          <label className={`block ${textMedium} mb-2`}>
            Version <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            value={version || ""}
            onChange={(e) => {
              const val = e.target.value;
              setVersion(val === "" ? 0 : parseInt(val));
            }}
            className={`w-full px-4 py-2 border rounded-lg text-slate-900 dark:text-white ${focusRing} ${
              !version || version < 1
                ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
                : "bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600"
            }`}
            placeholder="1"
          />
        </div>
      </div>
    </div>
  );
}
