// ui/src/apps/catalog/views/protocol-editors/CANConfigSection.tsx

import type { CANConfig } from "../../types";
import { flexRowGap2 } from "../../../../styles/spacing";
import { caption, textMedium, focusRing } from "../../../../styles";

export type CANConfigSectionProps = {
  config: CANConfig;
  onChange: (config: CANConfig) => void;
  existingIds?: string[];
  originalId?: string;
};

export default function CANConfigSection({
  config,
  onChange,
}: CANConfigSectionProps) {
  return (
    <div className="space-y-4">
      {/* ID - Required */}
      <div>
        <label className={`block ${textMedium} mb-2`}>
          ID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.id}
          onChange={(e) => onChange({ ...config, id: e.target.value })}
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white font-mono ${focusRing}`}
          placeholder="0x123"
        />
        <p className={`${caption} mt-1`}>
          Hex (0x123) or decimal (291) format
        </p>
      </div>

      {/* Extended ID checkbox */}
      <div className={flexRowGap2}>
        <input
          type="checkbox"
          id="extended"
          checked={config.extended ?? false}
          onChange={(e) => onChange({ ...config, extended: e.target.checked || undefined })}
          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="extended" className="text-sm text-slate-700 dark:text-slate-300">
          Extended ID (29-bit)
        </label>
      </div>

      {/* Bus - Optional */}
      <div>
        <label className={`block ${textMedium} mb-2`}>
          Bus
        </label>
        <input
          type="number"
          min="0"
          value={config.bus ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              bus: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white ${focusRing}`}
          placeholder="0"
        />
        <p className={`${caption} mt-1`}>
          CAN bus index (optional, for multi-bus systems)
        </p>
      </div>

      {/* Copy from - Optional */}
      <div>
        <label className={`block ${textMedium} mb-2`}>
          Copy From
        </label>
        <input
          type="text"
          value={config.copy ?? ""}
          onChange={(e) =>
            onChange({
              ...config,
              copy: e.target.value || undefined,
            })
          }
          className={`w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white font-mono ${focusRing}`}
          placeholder="0x456"
        />
        <p className={`${caption} mt-1`}>
          Inherit properties from another CAN frame (optional)
        </p>
      </div>
    </div>
  );
}
