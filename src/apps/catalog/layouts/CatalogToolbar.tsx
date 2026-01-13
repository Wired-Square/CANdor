// ui/src/apps/catalog/layout/CatalogToolbar.tsx

import { Check, ChevronDown, Download, FileText, Glasses, RotateCcw, Save, Settings, Star, X } from "lucide-react";
import type { EditMode } from "../types";
import type { CatalogMetadata } from "../../../api/catalog";

export type CatalogToolbarProps = {
  editMode: EditMode;
  catalogPath: string | null;
  hasUnsavedChanges: boolean;
  validationState: boolean | null; // null = not validated, true = valid, false = invalid

  // Catalog picker
  catalogs: CatalogMetadata[];
  defaultCatalogFilename?: string | null;

  onOpenPicker: () => void;
  onSave: () => void;
  onReload: () => void;
  onExport: () => void;
  onValidate: () => void;
  onToggleMode: () => void;
  onEditConfig: () => void;
};

export default function CatalogToolbar({
  editMode,
  catalogPath,
  hasUnsavedChanges,
  validationState,
  catalogs,
  defaultCatalogFilename,
  onOpenPicker,
  onSave,
  onReload,
  onExport,
  onValidate,
  onToggleMode,
  onEditConfig,
}: CatalogToolbarProps) {
  // Button style matching Discovery/Decoder
  const buttonBase =
    "flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed";

  // Icon button style
  const iconButtonBase =
    "p-1.5 rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed";

  // Get catalog display info
  const selectedCatalog = catalogs.find((c) => c.path === catalogPath);
  const catalogName = selectedCatalog?.name || catalogPath?.split("/").pop() || "No catalog";
  const isDefaultCatalog = selectedCatalog?.filename === defaultCatalogFilename;

  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2">
      <div className="flex items-center gap-2">
        {/* Catalog Editor icon */}
        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Catalog Picker Button */}
        <button
          onClick={onOpenPicker}
          className={buttonBase}
          title="Select catalog"
        >
          {isDefaultCatalog && (
            <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />
          )}
          <span className="max-w-40 truncate">{catalogName}</span>
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        </button>

        {/* Save */}
        <button
          onClick={onSave}
          disabled={!catalogPath}
          title={hasUnsavedChanges ? "Save changes (unsaved)" : "Save"}
          className={
            hasUnsavedChanges
              ? "p-1.5 rounded transition-colors bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              : iconButtonBase
          }
        >
          <Save className={`w-4 h-4 ${hasUnsavedChanges ? "animate-pulse" : ""}`} />
        </button>

        {/* Reload */}
        <button
          onClick={onReload}
          disabled={!catalogPath}
          title="Reload from disk"
          className={iconButtonBase}
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Validate */}
        <button
          onClick={onValidate}
          disabled={!catalogPath}
          title={
            validationState === true
              ? "Valid - Click to re-validate"
              : validationState === false
                ? "Invalid - Click to see errors"
                : "Validate catalog"
          }
          className={
            validationState === true
              ? "p-1.5 rounded transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              : validationState === false
                ? "p-1.5 rounded transition-colors bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                : iconButtonBase
          }
        >
          {validationState === false ? (
            <X className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          disabled={!catalogPath}
          title="Export catalog"
          className={iconButtonBase}
        >
          <Download className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Text mode toggle */}
        <button
          onClick={onToggleMode}
          disabled={!catalogPath}
          title={editMode === "ui" ? "Switch to Text Mode" : "Switch to GUI Mode"}
          className={
            editMode === "text"
              ? "p-1.5 rounded transition-colors bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              : iconButtonBase
          }
        >
          <Glasses className="w-4 h-4" fill={editMode === "text" ? "currentColor" : "none"} />
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Settings Button */}
        <button
          onClick={onEditConfig}
          disabled={!catalogPath}
          title="Catalog configuration"
          className={iconButtonBase}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
