// ui/src/dialogs/ExportReportDialog.tsx
// Generic export dialog for analysis reports

import { useState } from "react";
import Dialog from "../components/Dialog";
import { Select, FormField } from "../components/forms";
import {
  type ExportFormat,
  FORMAT_DESCRIPTIONS,
  FORMAT_OPTIONS,
  getFullFilename,
} from "../utils/reportExport";

export type ExportReportDialogProps = {
  open: boolean;
  title: string;
  description: string;
  defaultFilename: string;
  defaultPath?: string;
  onCancel: () => void;
  onExport: (format: ExportFormat, filename: string) => void;
};

export default function ExportReportDialog({
  open,
  title,
  description,
  defaultFilename,
  defaultPath,
  onCancel,
  onExport,
}: ExportReportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("text");

  const handleExport = () => {
    // Build full path with date prefix
    const fullFilename = getFullFilename(defaultFilename, format);
    const fullPath = defaultPath
      ? (defaultPath.endsWith('/') ? `${defaultPath}${fullFilename}` : `${defaultPath}/${fullFilename}`)
      : fullFilename;
    onExport(format, fullPath);
  };

  return (
    <Dialog isOpen={open} maxWidth="max-w-md">
      <div className="p-6 space-y-4">
        <div className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {description}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <FormField label="Format" variant="simple">
            <Select
              variant="simple"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              {FORMAT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormField>

          <div className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
            {FORMAT_DESCRIPTIONS[format]}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Save As...
          </button>
        </div>
      </div>
    </Dialog>
  );
}
