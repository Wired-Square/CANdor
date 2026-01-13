// ui/src/apps/decoder/dialogs/CatalogPickerDialog.tsx

import { Check, Star, X } from "lucide-react";
import Dialog from "../../../components/Dialog";
import type { CatalogMetadata } from "../../../api/catalog";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  catalogs: CatalogMetadata[];
  selectedPath: string | null;
  defaultFilename?: string | null;
  onSelect: (path: string) => void;
};

export default function CatalogPickerDialog({
  isOpen,
  onClose,
  catalogs,
  selectedPath,
  defaultFilename,
  onSelect,
}: Props) {
  const handleSelect = (path: string) => {
    onSelect(path);
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onBackdropClick={onClose} maxWidth="max-w-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Select Decoder Catalog
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
      </div>
    </Dialog>
  );
}
