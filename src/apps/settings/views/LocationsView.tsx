// ui/src/apps/settings/views/LocationsView.tsx
import { FolderOpen, AlertCircle } from "lucide-react";
import type { DirectoryValidation } from "../stores/settingsStore";

type LocationsViewProps = {
  decoderDir: string;
  dumpDir: string;
  reportDir: string;
  saveFrameIdFormat: "hex" | "decimal";
  decoderValidation: DirectoryValidation | null;
  dumpValidation: DirectoryValidation | null;
  reportValidation: DirectoryValidation | null;
  onChangeDecoderDir: (v: string) => void;
  onChangeDumpDir: (v: string) => void;
  onChangeReportDir: (v: string) => void;
  onChangeSaveFrameIdFormat: (v: "hex" | "decimal") => void;
  onPickDecoderDir: () => void;
  onPickDumpDir: () => void;
  onPickReportDir: () => void;
};

export default function LocationsView({
  decoderDir,
  dumpDir,
  reportDir,
  saveFrameIdFormat,
  decoderValidation,
  dumpValidation,
  reportValidation,
  onChangeDecoderDir,
  onChangeDumpDir,
  onChangeReportDir,
  onChangeSaveFrameIdFormat,
  onPickDecoderDir,
  onPickDumpDir,
  onPickReportDir,
}: LocationsViewProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Storage</h2>

        {/* Decoder Directory */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Decoder Directory
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={decoderDir}
              onChange={(e) => onChangeDecoderDir(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Click folder icon to select..."
            />
            <button
              onClick={onPickDecoderDir}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
              title="Browse for directory"
            >
              <FolderOpen className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          {decoderValidation?.error && (
            <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span>{decoderValidation.error}</span>
            </div>
          )}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Directory where decoder catalog files (.toml) are stored
          </p>
        </div>

        {/* Dump Directory */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Dump Directory
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={dumpDir}
              onChange={(e) => onChangeDumpDir(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Click folder icon to select..."
            />
            <button
              onClick={onPickDumpDir}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
              title="Browse for directory"
            >
              <FolderOpen className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          {dumpValidation?.error && (
            <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span>{dumpValidation.error}</span>
            </div>
          )}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Directory where CAN bus dump files are stored
          </p>
        </div>

        {/* Report Directory */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-900 dark:text-white mb-2">
            Report Directory
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={reportDir}
              onChange={(e) => onChangeReportDir(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Click folder icon to select..."
            />
            <button
              onClick={onPickReportDir}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors"
              title="Browse for directory"
            >
              <FolderOpen className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          {reportValidation?.error && (
            <div className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span>{reportValidation.error}</span>
            </div>
          )}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Default directory for exported analysis reports
          </p>
        </div>

        {/* Files */}
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Files</h2>
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-900 dark:text-white">Save frame ID format</div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="save-frame-id-format"
                  value="hex"
                  checked={saveFrameIdFormat === "hex"}
                  onChange={() => onChangeSaveFrameIdFormat("hex")}
                  className="accent-blue-600"
                />
                Hex
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="save-frame-id-format"
                  value="decimal"
                  checked={saveFrameIdFormat === "decimal"}
                  onChange={() => onChangeSaveFrameIdFormat("decimal")}
                  className="accent-blue-600"
                />
                Decimal
              </label>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Controls default decoder file names when saving/creating catalogs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
