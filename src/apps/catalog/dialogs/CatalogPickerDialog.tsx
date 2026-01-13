// ui/src/apps/catalog/dialogs/CatalogPickerDialog.tsx

import { Check, FilePlus, Import, Star, X } from "lucide-react";
import Dialog from "../../../components/Dialog";
import type { CatalogMetadata } from "../../../api/catalog";
import { pickFileToOpen } from "../../../api/dialogs";
import { openCatalog } from "../../../api/catalog";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  catalogs: CatalogMetadata[];
  selectedPath: string | null;
  defaultFilename?: string | null;
  onSelect: (path: string) => void;
  onImport?: (path: string, content: string) => void;
  onImportError?: (message: string) => void;
  onNewCatalog?: () => void;
};

export default function CatalogPickerDialog({
  isOpen,
  onClose,
  catalogs,
  selectedPath,
  defaultFilename,
  onSelect,
  onImport,
  onImportError,
  onNewCatalog,
}: Props) {
  const handleSelect = (path: string) => {
    onSelect(path);
    onClose();
  };

  const handleImport = async () => {
    try {
      const selected = await pickFileToOpen({
        filters: [
          { name: "Catalog Files", extensions: ["toml", "dbc"] },
          { name: "TOML Files", extensions: ["toml"] },
          { name: "DBC Files", extensions: ["dbc"] },
        ],
      });

      if (selected) {
        if (selected.endsWith(".dbc")) {
          // DBC import not yet supported
          onImportError?.("DBC import is not yet supported. Only TOML files can be imported.");
          return;
        }

        // Import TOML file
        const content = await openCatalog(selected);
        onImport?.(selected, content);
        onClose();
      }
    } catch (error) {
      console.error("Failed to import file:", error);
      onImportError?.(`Failed to import file: ${error}`);
    }
  };

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Select Catalog
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {catalogs.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
              No catalogs found. Add TOML catalog files to your decoder directory.
            </div>
          ) : (
            <div className="py-1">
              {catalogs.map((catalog) => {
                const isSelected = catalog.path === selectedPath;
                const isDefault = catalog.filename === defaultFilename;
                return (
                  <button
                    key={catalog.path}
                    onClick={() => handleSelect(catalog.path)}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                      isSelected ? "bg-slate-100 dark:bg-slate-700" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isDefault && (
                          <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />
                        )}
                        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {catalog.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {catalog.filename}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {(onNewCatalog || onImport) && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 flex gap-2">
            {onNewCatalog && (
              <button
                onClick={() => {
                  onNewCatalog();
                  onClose();
                }}
                className="flex items-center justify-center gap-2 flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <FilePlus className="w-4 h-4" />
                New Catalog
              </button>
            )}
            {onImport && (
              <button
                onClick={handleImport}
                className="flex items-center justify-center gap-2 flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <Import className="w-4 h-4" />
                Import from File
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
