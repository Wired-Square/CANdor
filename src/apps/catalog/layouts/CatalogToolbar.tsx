// ui/src/apps/catalog/layout/CatalogToolbar.tsx

import { Check, ChevronDown, Download, FileText, Glasses, RotateCcw, Save, Settings, Star, X } from "lucide-react";
import { iconMd, iconSm, iconLg, flexRowGap2 } from "../../../styles/spacing";
import { disabledState, borderDivider, bgSurface } from "../../../styles";
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
    `flex items-center gap-1 px-2 py-1.5 text-sm rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 ${disabledState}`;

  // Icon button style
  const iconButtonBase =
    `p-1.5 rounded transition-colors bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 ${disabledState}`;

  // Get catalog display info
  const selectedCatalog = catalogs.find((c) => c.path === catalogPath);
  const catalogName = selectedCatalog?.name || catalogPath?.split("/").pop() || "No catalog";
  const isDefaultCatalog = selectedCatalog?.filename === defaultCatalogFilename;

  return (
    <div className={`${bgSurface} ${borderDivider} px-4 py-2`}>
      <div className={flexRowGap2}>
        {/* Catalog Editor icon */}
        <FileText className={`${iconLg} text-blue-600 dark:text-blue-400`} />

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Catalog Picker Button */}
        <button
          onClick={onOpenPicker}
          className={buttonBase}
          title="Select catalog"
        >
          {isDefaultCatalog && (
            <Star className={`${iconSm} text-amber-500 flex-shrink-0`} fill="currentColor" />
          )}
          <span className="max-w-40 truncate">{catalogName}</span>
          <ChevronDown className={`${iconSm} flex-shrink-0 text-slate-400`} />
        </button>

        {/* Save */}
        <button
          onClick={onSave}
          disabled={!catalogPath}
          title={hasUnsavedChanges ? "Save changes (unsaved)" : "Save"}
          className={
            hasUnsavedChanges
              ? `p-1.5 rounded transition-colors bg-red-600 text-white hover:bg-red-700 shadow-md shadow-red-500/30 ${disabledState}`
              : iconButtonBase
          }
        >
          <Save className={`${iconMd} ${hasUnsavedChanges ? "animate-pulse" : ""}`} />
        </button>

        {/* Reload */}
        <button
          onClick={onReload}
          disabled={!catalogPath}
          title="Reload from disk"
          className={iconButtonBase}
        >
          <RotateCcw className={iconMd} />
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
              ? `p-1.5 rounded transition-colors bg-green-600 text-white hover:bg-green-700 ${disabledState}`
              : validationState === false
                ? `p-1.5 rounded transition-colors bg-red-600 text-white hover:bg-red-700 ${disabledState}`
                : iconButtonBase
          }
        >
          {validationState === false ? (
            <X className={iconMd} />
          ) : (
            <Check className={iconMd} />
          )}
        </button>

        {/* Export */}
        <button
          onClick={onExport}
          disabled={!catalogPath}
          title="Export catalog"
          className={iconButtonBase}
        >
          <Download className={iconMd} />
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Text mode toggle */}
        <button
          onClick={onToggleMode}
          disabled={!catalogPath}
          title={editMode === "ui" ? "Switch to Text Mode" : "Switch to GUI Mode"}
          className={
            editMode === "text"
              ? `p-1.5 rounded transition-colors bg-purple-600 text-white hover:bg-purple-700 ${disabledState}`
              : iconButtonBase
          }
        >
          <Glasses className={iconMd} fill={editMode === "text" ? "currentColor" : "none"} />
        </button>

        <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

        {/* Settings Button */}
        <button
          onClick={onEditConfig}
          disabled={!catalogPath}
          title="Catalog configuration"
          className={iconButtonBase}
        >
          <Settings className={iconMd} />
        </button>
      </div>
    </div>
  );
}
